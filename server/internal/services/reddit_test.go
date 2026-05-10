package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRedditJSONPathFromURL(t *testing.T) {
	tests := map[string]struct {
		rawURL string
		want   string
		ok     bool
	}{
		"subreddit comments": {rawURL: "https://www.reddit.com/r/webscraping/comments/1t51qlc/how_scrape_data_from_statsmuse/", want: "/r/webscraping/comments/1t51qlc/.json", ok: true},
		"old reddit":         {rawURL: "https://old.reddit.com/r/webscraping/comments/1t51qlc/", want: "/r/webscraping/comments/1t51qlc/.json", ok: true},
		"short link":         {rawURL: "https://redd.it/1t51qlc", want: "/comments/1t51qlc/.json", ok: true},
		"short link slug":    {rawURL: "https://redd.it/1t51qlc/example", want: "/comments/1t51qlc/.json", ok: true},
		"unsupported host":   {rawURL: "https://example.com/r/webscraping/comments/1t51qlc/", ok: false},
		"missing post id":    {rawURL: "https://www.reddit.com/r/webscraping/comments/", ok: false},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			got, err := RedditJSONPathFromURL(tc.rawURL)
			if tc.ok && err != nil {
				t.Fatalf("RedditJSONPathFromURL() error = %v", err)
			}
			if !tc.ok && err == nil {
				t.Fatal("RedditJSONPathFromURL() error = nil, want error")
			}
			if got != tc.want {
				t.Fatalf("RedditJSONPathFromURL() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRedditClientFetchPost(t *testing.T) {
	var sawRequest bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawRequest = true
		if r.URL.Path != "/r/webscraping/comments/1t51qlc/.json" {
			t.Fatalf("path = %q, want reddit json path", r.URL.Path)
		}
		if r.Header.Get("User-Agent") != "web:mindtab.reddit-summary:v0.1.1" {
			t.Fatalf("User-Agent = %q, want configured user agent", r.Header.Get("User-Agent"))
		}
		query := r.URL.Query()
		if query.Get("limit") != "100" || query.Get("sort") != "best" || query.Get("raw_json") != "1" {
			t.Fatalf("query = %s, want limit/sort/raw_json", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{
				"kind": "Listing",
				"data": {
					"children": [{
						"kind": "t3",
						"data": {
							"id": "1t51qlc",
							"name": "t3_1t51qlc",
							"title": "How scrape data from Statsmuse",
							"selftext": "I'm an absolute beginner",
							"author": "ishowloveee",
							"subreddit": "webscraping",
							"subreddit_name_prefixed": "r/webscraping",
							"domain": "self.webscraping",
							"link_flair_text": "Getting started",
							"post_hint": "self",
							"thumbnail": "self",
							"url": "https://www.reddit.com/r/webscraping/comments/1t51qlc/how_scrape_data_from_statsmuse/",
							"permalink": "/r/webscraping/comments/1t51qlc/how_scrape_data_from_statsmuse/",
							"is_self": true,
							"is_video": false,
							"score": 1,
							"upvote_ratio": 1.0,
							"num_comments": 7,
							"subreddit_subscribers": 93570,
							"created_utc": 1778039236,
							"preview": {
								"images": [{
									"source": {
										"url": "https://external-preview.redd.it/preview.png",
										"width": 1200,
										"height": 630
									}
								}]
							}
						}
					}]
				}
			},
			{
				"kind": "Listing",
				"data": {
					"children": [{
						"kind": "t1",
						"data": {
							"id": "ok6ykvl",
							"name": "t1_ok6ykvl",
							"parent_id": "t3_1t51qlc",
							"permalink": "/r/webscraping/comments/1t51qlc/how_scrape_data_from_statsmuse/ok6ykvl/",
							"body": "Generally, your first step is to retrieve the webpage.",
							"author": "fixxation92",
							"score": 1,
							"depth": 0,
							"is_submitter": false,
							"created_utc": 1778042211,
							"replies": {
								"kind": "Listing",
								"data": {
									"children": [{
										"kind": "t1",
										"data": {
											"id": "ok6ys84",
											"name": "t1_ok6ys84",
											"parent_id": "t1_ok6ykvl",
											"permalink": "/r/webscraping/comments/1t51qlc/how_scrape_data_from_statsmuse/ok6ys84/",
											"body": "I use Google Colab and GPT to generate Python.",
											"author": "ishowloveee",
											"score": -1,
											"depth": 1,
											"is_submitter": true,
											"created_utc": 1778042303,
											"replies": ""
										}
									}]
								}
							}
						}
					}]
				}
			}
		]`))
	}))
	defer server.Close()

	client := NewRedditClient("")
	client.SetBaseURL(server.URL)

	got, err := client.FetchPost(context.Background(), "https://www.reddit.com/r/webscraping/comments/1t51qlc/how_scrape_data_from_statsmuse/")
	if err != nil {
		t.Fatalf("FetchPost() error = %v", err)
	}
	if !sawRequest {
		t.Fatal("server did not receive request")
	}
	if got.ID != "1t51qlc" || got.Title != "How scrape data from Statsmuse" {
		t.Fatalf("post = %#v, want parsed post", got)
	}
	if got.Permalink != "https://www.reddit.com/r/webscraping/comments/1t51qlc/how_scrape_data_from_statsmuse/" {
		t.Fatalf("Permalink = %q, want absolute permalink", got.Permalink)
	}
	if got.CreatedAt != time.Date(2026, 5, 6, 3, 47, 16, 0, time.UTC) {
		t.Fatalf("CreatedAt = %v, want parsed post time", got.CreatedAt)
	}
	if len(got.PreviewImages) != 1 || got.PreviewImages[0].Width != 1200 {
		t.Fatalf("PreviewImages = %#v, want parsed preview", got.PreviewImages)
	}
	if len(got.Comments) != 2 {
		t.Fatalf("comments = %#v, want top comment and nested reply", got.Comments)
	}
	if got.Comments[0].Author != "fixxation92" || got.Comments[0].Depth != 0 {
		t.Fatalf("top comment = %#v, want parsed top comment", got.Comments[0])
	}
	if got.Comments[1].Author != "ishowloveee" || !got.Comments[1].IsSubmitter || got.Comments[1].Depth != 1 {
		t.Fatalf("nested comment = %#v, want parsed nested submitter reply", got.Comments[1])
	}
}

func TestRedditClientFetchPostClassifiesHTTPStatusErrors(t *testing.T) {
	tests := map[string]struct {
		status    int
		retriable bool
	}{
		"bad request is permanent":  {status: http.StatusBadRequest, retriable: false},
		"unauthorized is permanent": {status: http.StatusUnauthorized, retriable: false},
		"forbidden is permanent":    {status: http.StatusForbidden, retriable: false},
		"not found is permanent":    {status: http.StatusNotFound, retriable: false},
		"rate limit is retriable":   {status: http.StatusTooManyRequests, retriable: true},
		"server error is retriable": {status: http.StatusInternalServerError, retriable: true},
		"bad gateway is retriable":  {status: http.StatusBadGateway, retriable: true},
		"unavailable is retriable":  {status: http.StatusServiceUnavailable, retriable: true},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(`{"error":"upstream"}`))
			}))
			defer server.Close()

			client := NewRedditClient("")
			client.SetBaseURL(server.URL)

			_, err := client.FetchPost(context.Background(), "https://www.reddit.com/r/webscraping/comments/1t51qlc/example/")
			assertProviderError(t, err, "reddit", tc.retriable)
		})
	}
}

func TestRedditClientFetchPostClassifiesRequestErrorsRetriable(t *testing.T) {
	client := NewRedditClient("")
	client.SetHTTPClient(&http.Client{Transport: failingRoundTripper{err: temporaryRequestError{}}})

	_, err := client.FetchPost(context.Background(), "https://www.reddit.com/r/webscraping/comments/1t51qlc/example/")
	assertProviderError(t, err, "reddit", true)
}
