package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/ksushant6566/mindtab/server/internal/providers"
)

const (
	defaultRedditBaseURL   = "https://www.reddit.com"
	defaultRedditUserAgent = "web:mindtab.reddit-summary:v0.1.1"
)

type RedditClient struct {
	baseURL    string
	userAgent  string
	limit      int
	sort       string
	httpClient *http.Client
}

type RedditPost struct {
	ID                   string               `json:"id"`
	Name                 string               `json:"name"`
	URL                  string               `json:"url"`
	Permalink            string               `json:"permalink"`
	Title                string               `json:"title"`
	SelfText             string               `json:"selftext,omitempty"`
	Author               string               `json:"author"`
	Subreddit            string               `json:"subreddit"`
	SubredditName        string               `json:"subreddit_name"`
	Domain               string               `json:"domain,omitempty"`
	LinkFlairText        string               `json:"link_flair_text,omitempty"`
	PostHint             string               `json:"post_hint,omitempty"`
	Thumbnail            string               `json:"thumbnail,omitempty"`
	IsSelf               bool                 `json:"is_self"`
	IsVideo              bool                 `json:"is_video"`
	Over18               bool                 `json:"over_18"`
	Spoiler              bool                 `json:"spoiler"`
	Locked               bool                 `json:"locked"`
	Score                int                  `json:"score"`
	UpvoteRatio          float64              `json:"upvote_ratio"`
	NumComments          int                  `json:"num_comments"`
	SubredditSubscribers int                  `json:"subreddit_subscribers"`
	CreatedAt            time.Time            `json:"created_at,omitempty"`
	PreviewImages        []RedditPreviewImage `json:"preview_images,omitempty"`
	Comments             []RedditComment      `json:"comments,omitempty"`
}

type RedditPreviewImage struct {
	URL    string `json:"url"`
	Width  int    `json:"width,omitempty"`
	Height int    `json:"height,omitempty"`
}

type RedditComment struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	ParentID    string    `json:"parent_id"`
	Permalink   string    `json:"permalink"`
	Body        string    `json:"body"`
	Author      string    `json:"author"`
	Score       int       `json:"score"`
	Depth       int       `json:"depth"`
	IsSubmitter bool      `json:"is_submitter"`
	CreatedAt   time.Time `json:"created_at,omitempty"`
}

func NewRedditClient(userAgent string) *RedditClient {
	if strings.TrimSpace(userAgent) == "" {
		userAgent = defaultRedditUserAgent
	}
	return &RedditClient{
		baseURL:    defaultRedditBaseURL,
		userAgent:  userAgent,
		limit:      100,
		sort:       "best",
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (r *RedditClient) SetBaseURL(baseURL string) {
	r.baseURL = strings.TrimRight(baseURL, "/")
}

func (r *RedditClient) SetHTTPClient(client *http.Client) {
	if client != nil {
		r.httpClient = client
	}
}

func (r *RedditClient) SetCommentLimit(limit int) {
	if limit > 0 {
		r.limit = limit
	}
}

func (r *RedditClient) FetchPost(ctx context.Context, rawURL string) (*RedditPost, error) {
	jsonPath, err := RedditJSONPathFromURL(rawURL)
	if err != nil {
		return nil, err
	}
	endpoint, err := url.Parse(r.baseURL + jsonPath)
	if err != nil {
		return nil, fmt.Errorf("reddit: parse endpoint: %w", err)
	}
	q := endpoint.Query()
	q.Set("limit", fmt.Sprintf("%d", r.limit))
	q.Set("sort", r.sort)
	q.Set("raw_json", "1")
	endpoint.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("reddit: create request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, providers.NewRetriableError("reddit", fmt.Errorf("reddit: request: %w", err))
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, providers.NewRetriableError("reddit", fmt.Errorf("reddit: read response: %w", err))
	}
	if resp.StatusCode != http.StatusOK {
		return nil, officialHTTPStatusError("reddit", "reddit", resp.StatusCode, body)
	}

	var listings []redditListing
	if err := json.Unmarshal(body, &listings); err != nil {
		return nil, fmt.Errorf("reddit: parse response: %w", err)
	}
	if len(listings) == 0 || len(listings[0].Data.Children) == 0 || listings[0].Data.Children[0].Kind != "t3" {
		return nil, fmt.Errorf("reddit: response missing post listing")
	}

	post := normalizeRedditPost(listings[0].Data.Children[0].Data)
	if len(listings) > 1 {
		post.Comments = flattenRedditComments(listings[1].Data.Children, r.limit)
	}
	return post, nil
}

func RedditJSONPathFromURL(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("reddit: parse url: %w", err)
	}
	host := strings.ToLower(u.Hostname())
	if host == "redd.it" || host == "www.redd.it" {
		parts := strings.Split(strings.Trim(u.EscapedPath(), "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			return "", fmt.Errorf("reddit: redd.it url missing post id")
		}
		return "/comments/" + parts[0] + "/.json", nil
	}
	if host != "reddit.com" && host != "www.reddit.com" && host != "old.reddit.com" && host != "new.reddit.com" && host != "m.reddit.com" {
		return "", fmt.Errorf("reddit: unsupported host %q", host)
	}
	parts := strings.Split(strings.Trim(u.EscapedPath(), "/"), "/")
	for i, part := range parts {
		if part == "comments" && i+1 < len(parts) && parts[i+1] != "" {
			return "/" + path.Join(parts[:i+2]...) + "/.json", nil
		}
	}
	return "", fmt.Errorf("reddit: url does not contain a comments post id")
}

func normalizeRedditPost(data redditThingData) *RedditPost {
	post := &RedditPost{
		ID:                   data.ID,
		Name:                 data.Name,
		URL:                  data.URL,
		Permalink:            redditAbsoluteURL(data.Permalink),
		Title:                data.Title,
		SelfText:             data.SelfText,
		Author:               data.Author,
		Subreddit:            data.Subreddit,
		SubredditName:        data.SubredditNamePrefixed,
		Domain:               data.Domain,
		LinkFlairText:        data.LinkFlairText,
		PostHint:             data.PostHint,
		Thumbnail:            data.Thumbnail,
		IsSelf:               data.IsSelf,
		IsVideo:              data.IsVideo,
		Over18:               data.Over18,
		Spoiler:              data.Spoiler,
		Locked:               data.Locked,
		Score:                data.Score,
		UpvoteRatio:          data.UpvoteRatio,
		NumComments:          data.NumComments,
		SubredditSubscribers: data.SubredditSubscribers,
		CreatedAt:            unixSeconds(data.CreatedUTC),
	}
	for _, image := range data.Preview.Images {
		if image.Source.URL == "" {
			continue
		}
		post.PreviewImages = append(post.PreviewImages, RedditPreviewImage{
			URL:    image.Source.URL,
			Width:  image.Source.Width,
			Height: image.Source.Height,
		})
	}
	if post.URL == "" {
		post.URL = post.Permalink
	}
	return post
}

func flattenRedditComments(children []redditThing, max int) []RedditComment {
	var comments []RedditComment
	var walk func([]redditThing)
	walk = func(nodes []redditThing) {
		for _, node := range nodes {
			if max > 0 && len(comments) >= max {
				return
			}
			if node.Kind != "t1" {
				continue
			}
			data := node.Data
			comments = append(comments, RedditComment{
				ID:          data.ID,
				Name:        data.Name,
				ParentID:    data.ParentID,
				Permalink:   redditAbsoluteURL(data.Permalink),
				Body:        data.Body,
				Author:      data.Author,
				Score:       data.Score,
				Depth:       data.Depth,
				IsSubmitter: data.IsSubmitter,
				CreatedAt:   unixSeconds(data.CreatedUTC),
			})
			if data.Replies.Listing != nil {
				walk(data.Replies.Listing.Data.Children)
			}
		}
	}
	walk(children)
	return comments
}

func redditAbsoluteURL(permalink string) string {
	if permalink == "" {
		return ""
	}
	if strings.HasPrefix(permalink, "http://") || strings.HasPrefix(permalink, "https://") {
		return permalink
	}
	return defaultRedditBaseURL + permalink
}

func unixSeconds(value float64) time.Time {
	if value <= 0 {
		return time.Time{}
	}
	return time.Unix(int64(value), 0).UTC()
}

type redditListing struct {
	Kind string            `json:"kind"`
	Data redditListingData `json:"data"`
}

type redditListingData struct {
	Children []redditThing `json:"children"`
}

type redditThing struct {
	Kind string          `json:"kind"`
	Data redditThingData `json:"data"`
}

type redditThingData struct {
	ID                    string        `json:"id"`
	Name                  string        `json:"name"`
	Title                 string        `json:"title"`
	SelfText              string        `json:"selftext"`
	Body                  string        `json:"body"`
	Author                string        `json:"author"`
	Subreddit             string        `json:"subreddit"`
	SubredditNamePrefixed string        `json:"subreddit_name_prefixed"`
	Domain                string        `json:"domain"`
	LinkFlairText         string        `json:"link_flair_text"`
	PostHint              string        `json:"post_hint"`
	Thumbnail             string        `json:"thumbnail"`
	URL                   string        `json:"url"`
	Permalink             string        `json:"permalink"`
	ParentID              string        `json:"parent_id"`
	IsSelf                bool          `json:"is_self"`
	IsVideo               bool          `json:"is_video"`
	Over18                bool          `json:"over_18"`
	Spoiler               bool          `json:"spoiler"`
	Locked                bool          `json:"locked"`
	IsSubmitter           bool          `json:"is_submitter"`
	Score                 int           `json:"score"`
	UpvoteRatio           float64       `json:"upvote_ratio"`
	NumComments           int           `json:"num_comments"`
	SubredditSubscribers  int           `json:"subreddit_subscribers"`
	Depth                 int           `json:"depth"`
	CreatedUTC            float64       `json:"created_utc"`
	Preview               redditPreview `json:"preview"`
	Replies               redditReplies `json:"replies"`
}

type redditPreview struct {
	Images []redditPreviewImage `json:"images"`
}

type redditPreviewImage struct {
	Source redditPreviewSource `json:"source"`
}

type redditPreviewSource struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type redditReplies struct {
	Listing *redditListing
}

func (r *redditReplies) UnmarshalJSON(data []byte) error {
	if string(data) == `""` || string(data) == "null" {
		return nil
	}
	var listing redditListing
	if err := json.Unmarshal(data, &listing); err != nil {
		return err
	}
	r.Listing = &listing
	return nil
}
