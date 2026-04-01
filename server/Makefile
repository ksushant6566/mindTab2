.PHONY: test test-integration test-coverage generate-mocks

test:
	go test ./...

test-integration:
	go test -tags=integration ./...

test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

generate-mocks:
	moq -out internal/store/mock_querier.go -pkg store ./internal/store Querier
	# moq adds a self-import (store -> store) when generating within the same package.
	# Remove the cyclic import and strip the now-unnecessary "store." qualifier.
	# Uses temp file instead of sed -i for cross-platform compatibility (macOS vs GNU sed).
	sed -e '/github.com\/ksushant6566\/mindtab\/server\/internal\/store/d' \
		-e 's/store\.\([A-Z]\)/\1/g' \
		internal/store/mock_querier.go > internal/store/mock_querier.go.tmp
	mv internal/store/mock_querier.go.tmp internal/store/mock_querier.go
