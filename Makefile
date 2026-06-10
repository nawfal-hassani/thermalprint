.PHONY: help install install-backend install-frontend dev backend frontend build lint clean

.DEFAULT_GOAL := dev

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: install-backend install-frontend ## Installe toutes les dépendances

install-backend: ## Installe les dépendances Python du backend
	pip install --user --break-system-packages -r backend/requirements.txt

install-frontend: ## Installe les dépendances npm du frontend
	cd frontend && npm install

dev: ## Lance backend (:8000) + frontend (:3000) en parallèle
	$(MAKE) -j2 backend frontend

backend: ## Lance le backend FastAPI sur :8000
	cd backend && ./run.sh

frontend: ## Lance le frontend Next.js sur :3000
	cd frontend && npm run dev

build: ## Build de production du frontend
	cd frontend && npm run build

lint: ## Lint du frontend
	cd frontend && npm run lint

clean: ## Supprime node_modules et les caches de build
	rm -rf frontend/node_modules frontend/.next
	find backend -type d -name __pycache__ -exec rm -rf {} +
