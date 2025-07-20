## Makefile

.PHONY: help setup lint fmt test build release docs clean

help: ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		sed 's/\t/    /g' | \
		awk 'BEGIN {FS = ":.*?## "}; { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }'

setup: ## Install project dependencies.
	npm install

lint: ## Run ESLint.
	npm run lint

fmt: ## Run Prettier.
	npm run format

test: ## Run tests.
	npm test

build: ## Build project.
	npm run build

release: ## Bump version and publish.
	npm run release

docs: ## No build step for docs; Markdown files in docs/.
	@echo "No docs to build; see docs/"

clean: ## Remove build artifacts.
	rm -rf dist coverage
