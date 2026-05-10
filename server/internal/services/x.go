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
)

const defaultXAPIBaseURL = "https://api.x.com/2"

type XClient struct {
	bearerToken string
	baseURL     string
	httpClient  *http.Client
}

type XPost struct {
	ID               string
	URL              string
	Text             string
	AuthorID         string
	AuthorName       string
	AuthorUsername   string
	ConversationID   string
	Lang             string
	CreatedAt        time.Time
	PublicMetrics    XPostMetrics
	Media            []XMedia
	ReferencedTweets []XReferencedTweet
}

type XPostMetrics struct {
	RetweetCount    int
	ReplyCount      int
	LikeCount       int
	QuoteCount      int
	BookmarkCount   int
	ImpressionCount int
}

type XMedia struct {
	MediaKey        string
	Type            string
	URL             string
	PreviewImageURL string
	AltText         string
	Width           int
	Height          int
	DurationMS      int
}

type XReferencedTweet struct {
	Type           string
	ID             string
	Text           string
	AuthorID       string
	AuthorName     string
	AuthorUsername string
}

func NewXClient(bearerToken string) *XClient {
	return &XClient{
		bearerToken: bearerToken,
		baseURL:     defaultXAPIBaseURL,
		httpClient:  &http.Client{Timeout: 15 * time.Second},
	}
}

func (x *XClient) SetBaseURL(baseURL string) {
	x.baseURL = strings.TrimRight(baseURL, "/")
}

func (x *XClient) SetHTTPClient(client *http.Client) {
	if client != nil {
		x.httpClient = client
	}
}

func (x *XClient) FetchPost(ctx context.Context, rawURL string) (*XPost, error) {
	if strings.TrimSpace(x.bearerToken) == "" {
		return nil, fmt.Errorf("x: bearer token is required")
	}
	tweetID, err := XPostIDFromURL(rawURL)
	if err != nil {
		return nil, err
	}

	endpoint, err := url.Parse(x.baseURL + "/tweets/" + tweetID)
	if err != nil {
		return nil, fmt.Errorf("x: parse endpoint: %w", err)
	}
	q := endpoint.Query()
	q.Set("expansions", "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id")
	q.Set("tweet.fields", "attachments,author_id,conversation_id,created_at,entities,id,lang,note_tweet,public_metrics,referenced_tweets,text")
	q.Set("user.fields", "id,name,username,verified,profile_image_url")
	q.Set("media.fields", "alt_text,duration_ms,height,media_key,preview_image_url,type,url,width")
	endpoint.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("x: create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+x.bearerToken)
	req.Header.Set("Accept", "application/json")

	resp, err := x.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("x: request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("x: read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("x: status %d: %s", resp.StatusCode, string(body))
	}

	var payload xTweetLookupResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("x: parse response: %w", err)
	}
	if payload.Data.ID == "" {
		return nil, fmt.Errorf("x: response missing tweet data")
	}

	return x.normalizePost(rawURL, payload), nil
}

func XPostIDFromURL(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("x: parse url: %w", err)
	}
	host := strings.ToLower(u.Hostname())
	if host != "x.com" && host != "www.x.com" && host != "twitter.com" && host != "www.twitter.com" && host != "mobile.twitter.com" {
		return "", fmt.Errorf("x: unsupported host %q", host)
	}
	parts := strings.Split(strings.Trim(u.EscapedPath(), "/"), "/")
	for i, part := range parts {
		if part == "status" && i+1 < len(parts) && parts[i+1] != "" {
			return parts[i+1], nil
		}
	}
	return "", fmt.Errorf("x: url does not contain a status id")
}

func (x *XClient) normalizePost(rawURL string, payload xTweetLookupResponse) *XPost {
	usersByID := make(map[string]xUser, len(payload.Includes.Users))
	for _, user := range payload.Includes.Users {
		usersByID[user.ID] = user
	}
	mediaByKey := make(map[string]xMedia, len(payload.Includes.Media))
	for _, media := range payload.Includes.Media {
		mediaByKey[media.MediaKey] = media
	}
	tweetsByID := make(map[string]xTweet, len(payload.Includes.Tweets))
	for _, tweet := range payload.Includes.Tweets {
		tweetsByID[tweet.ID] = tweet
	}

	author := usersByID[payload.Data.AuthorID]
	post := &XPost{
		ID:             payload.Data.ID,
		URL:            rawURL,
		Text:           payload.Data.text(),
		AuthorID:       payload.Data.AuthorID,
		AuthorName:     author.Name,
		AuthorUsername: author.Username,
		ConversationID: payload.Data.ConversationID,
		Lang:           payload.Data.Lang,
		CreatedAt:      parseTimeRFC3339(payload.Data.CreatedAt),
		PublicMetrics: XPostMetrics{
			RetweetCount:    payload.Data.PublicMetrics.RetweetCount,
			ReplyCount:      payload.Data.PublicMetrics.ReplyCount,
			LikeCount:       payload.Data.PublicMetrics.LikeCount,
			QuoteCount:      payload.Data.PublicMetrics.QuoteCount,
			BookmarkCount:   payload.Data.PublicMetrics.BookmarkCount,
			ImpressionCount: payload.Data.PublicMetrics.ImpressionCount,
		},
	}
	if canonical := xCanonicalURL(author.Username, payload.Data.ID); canonical != "" {
		post.URL = canonical
	}
	for _, key := range payload.Data.Attachments.MediaKeys {
		media, ok := mediaByKey[key]
		if !ok {
			continue
		}
		post.Media = append(post.Media, XMedia{
			MediaKey:        media.MediaKey,
			Type:            media.Type,
			URL:             media.URL,
			PreviewImageURL: media.PreviewImageURL,
			AltText:         media.AltText,
			Width:           media.Width,
			Height:          media.Height,
			DurationMS:      media.DurationMS,
		})
	}
	for _, ref := range payload.Data.ReferencedTweets {
		tweet, ok := tweetsByID[ref.ID]
		if !ok {
			post.ReferencedTweets = append(post.ReferencedTweets, XReferencedTweet{Type: ref.Type, ID: ref.ID})
			continue
		}
		refAuthor := usersByID[tweet.AuthorID]
		post.ReferencedTweets = append(post.ReferencedTweets, XReferencedTweet{
			Type:           ref.Type,
			ID:             ref.ID,
			Text:           tweet.text(),
			AuthorID:       tweet.AuthorID,
			AuthorName:     refAuthor.Name,
			AuthorUsername: refAuthor.Username,
		})
	}
	return post
}

func parseTimeRFC3339(value string) time.Time {
	if value == "" {
		return time.Time{}
	}
	t, _ := time.Parse(time.RFC3339, value)
	return t
}

func xCanonicalURL(username, id string) string {
	if username == "" || id == "" {
		return ""
	}
	return (&url.URL{
		Scheme: "https",
		Host:   "x.com",
		Path:   path.Join(username, "status", id),
	}).String()
}

type xTweetLookupResponse struct {
	Data     xTweet    `json:"data"`
	Includes xIncludes `json:"includes"`
}

type xIncludes struct {
	Users  []xUser  `json:"users"`
	Media  []xMedia `json:"media"`
	Tweets []xTweet `json:"tweets"`
}

type xTweet struct {
	ID               string             `json:"id"`
	Text             string             `json:"text"`
	AuthorID         string             `json:"author_id"`
	ConversationID   string             `json:"conversation_id"`
	Lang             string             `json:"lang"`
	CreatedAt        string             `json:"created_at"`
	PublicMetrics    xPublicMetrics     `json:"public_metrics"`
	Attachments      xAttachments       `json:"attachments"`
	ReferencedTweets []xReferencedTweet `json:"referenced_tweets"`
	NoteTweet        xNoteTweet         `json:"note_tweet"`
}

func (t xTweet) text() string {
	if strings.TrimSpace(t.NoteTweet.Text) != "" {
		return t.NoteTweet.Text
	}
	return t.Text
}

type xNoteTweet struct {
	Text string `json:"text"`
}

type xPublicMetrics struct {
	RetweetCount    int `json:"retweet_count"`
	ReplyCount      int `json:"reply_count"`
	LikeCount       int `json:"like_count"`
	QuoteCount      int `json:"quote_count"`
	BookmarkCount   int `json:"bookmark_count"`
	ImpressionCount int `json:"impression_count"`
}

type xAttachments struct {
	MediaKeys []string `json:"media_keys"`
}

type xReferencedTweet struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type xUser struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
}

type xMedia struct {
	MediaKey        string `json:"media_key"`
	Type            string `json:"type"`
	URL             string `json:"url"`
	PreviewImageURL string `json:"preview_image_url"`
	AltText         string `json:"alt_text"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	DurationMS      int    `json:"duration_ms"`
}
