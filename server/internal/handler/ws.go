package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/ksushant6566/mindtab/server/internal/auth"
	"github.com/ksushant6566/mindtab/server/internal/chat"
)

const (
	// Time allowed to write a message to the peer.
	wsWriteWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	wsPongWait = 5 * time.Minute

	// Send pings to peer with this period. Must be less than pongWait.
	wsPingPeriod = 30 * time.Second

	// Maximum message size allowed from peer.
	wsMaxMessageSize = 8192
)

// WSHandler handles WebSocket connections for the chat feature.
type WSHandler struct {
	orchestrator   *chat.Orchestrator
	jwtSecret      string
	allowedOrigins []string
	upgrader       websocket.Upgrader
}

// NewWSHandler creates a new WSHandler.
func NewWSHandler(orchestrator *chat.Orchestrator, jwtSecret string, allowedOrigins []string) *WSHandler {
	h := &WSHandler{
		orchestrator:   orchestrator,
		jwtSecret:      jwtSecret,
		allowedOrigins: allowedOrigins,
	}
	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true // mobile apps and non-browser clients
			}
			// Allow localhost and local network IPs for development (Metro bundler on physical devices)
			if strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "https://localhost") ||
				strings.HasPrefix(origin, "http://192.168.") || strings.HasPrefix(origin, "http://10.") ||
				strings.HasPrefix(origin, "http://172.") {
				return true
			}
			// React Native on-device: origin may be the app scheme or "file://"
			if origin == "file://" {
				return true
			}
			// Check against configured allowed origins
			for _, allowed := range h.allowedOrigins {
				if origin == allowed {
					return true
				}
			}
			return false
		},
	}
	return h
}

// HandleChat upgrades the HTTP connection to WebSocket and manages the chat session.
func (h *WSHandler) HandleChat(w http.ResponseWriter, r *http.Request) {
	// 1. Extract and validate JWT from query param
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, `{"error":"missing token query parameter"}`, http.StatusUnauthorized)
		return
	}

	claims, err := auth.ValidateAccessToken(h.jwtSecret, token)
	if err != nil {
		http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
		return
	}
	userID := claims.UserID

	// 2. Upgrade to WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "error", err, "userID", userID)
		return
	}
	defer conn.Close()

	slog.Info("websocket connected", "userID", userID)

	// 3. Set up connection parameters
	conn.SetReadLimit(wsMaxMessageSize)
	conn.SetReadDeadline(time.Now().Add(wsPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})

	// 4. Channels and cancellation
	writeChan := make(chan chat.WSServerMessage, 64)
	done := make(chan struct{})

	// cancelMu protects the active cancel function and generation counter.
	// The generation counter lets the goroutine know if it's still the active one.
	var cancelMu sync.Mutex
	var activeCancel context.CancelFunc
	var activeGen uint64
	var handlerWg sync.WaitGroup // tracks active orchestrator goroutines

	// 5. Write loop goroutine
	go func() {
		ticker := time.NewTicker(wsPingPeriod)
		defer ticker.Stop()
		defer close(done)

		for {
			select {
			case msg, ok := <-writeChan:
				if !ok {
					// Channel closed — send close frame
					conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
					conn.WriteMessage(websocket.CloseMessage,
						websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
					return
				}
				conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
				if err := conn.WriteJSON(msg); err != nil {
					slog.Error("websocket write error", "error", err, "userID", userID)
					return
				}
			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					slog.Error("websocket ping error", "error", err, "userID", userID)
					return
				}
			}
		}
	}()

	// 6. Read loop
	for {
		_, rawMsg, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Error("websocket read error", "error", err, "userID", userID)
			}
			break
		}

		var clientMsg chat.WSClientMessage
		if err := json.Unmarshal(rawMsg, &clientMsg); err != nil {
			writeChan <- chat.WSServerMessage{
				Type:    "error",
				Code:    "invalid_message",
				Message: "Failed to parse message.",
			}
			continue
		}

		switch clientMsg.Type {
		case "message.send":
			// Cancel any active stream before starting a new one
			cancelMu.Lock()
			if activeCancel != nil {
				activeCancel()
			}
			ctx, cancel := context.WithCancel(r.Context())
			activeCancel = cancel
			activeGen++
			myGen := activeGen
			cancelMu.Unlock()

			handlerWg.Add(1)
			go func(ctx context.Context, gen uint64) {
				defer handlerWg.Done()
				defer func() {
					cancelMu.Lock()
					if activeGen == gen {
						activeCancel = nil
					}
					cancelMu.Unlock()
				}()
				h.orchestrator.HandleMessage(ctx, userID, clientMsg, writeChan)
			}(ctx, myGen)

		case "message.cancel":
			cancelMu.Lock()
			if activeCancel != nil {
				activeCancel()
				activeCancel = nil
			}
			cancelMu.Unlock()

		default:
			writeChan <- chat.WSServerMessage{
				Type:    "error",
				Code:    "unknown_type",
				Message: fmt.Sprintf("Unknown message type: %s", clientMsg.Type),
			}
		}
	}

	// 7. Clean up on disconnect
	cancelMu.Lock()
	if activeCancel != nil {
		activeCancel()
	}
	cancelMu.Unlock()

	// Wait for orchestrator goroutine to finish BEFORE closing the channel
	handlerWg.Wait()

	close(writeChan)
	<-done

	slog.Info("websocket disconnected", "userID", userID)
}
