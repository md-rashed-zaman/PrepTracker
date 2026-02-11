package auth

import (
	"net/http"
	"strings"

	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
)

func RequireAuth(jwt *JWT) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authz := r.Header.Get("Authorization")
			if !strings.HasPrefix(authz, "Bearer ") {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			raw := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
			claims, err := jwt.Verify(raw)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			ctx := reqctx.WithUserID(r.Context(), claims.Subject)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
