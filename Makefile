.PHONY: dev host web test install stop restart deploy build rebuild pack

# 默认：装依赖并同时起集中部署 host(:3141)+Vite(:5173) 与本机 host(:3151)+Vite(:5174)
dev: install
	npm run dev

host:
	npm run dev:host

web:
	npm run dev:web

install:
	npm install

# 停掉 dev 进程并等到它们退出。
# 只看端口会提前返回：node 关掉监听之后还占着 sqlite，马上再起就会锁库或端口冲突。
# 页面开着时 Vite 不会自己退出，所以只等一小段时间，没退就结束进程。
stop:
	@node scripts/stop-dev.mjs

# 先停再启。stop 会等到旧进程退出。
restart: stop
	@$(MAKE) --no-print-directory dev

# 浏览器里直接用，不打包。5173 云端（.cloud-data），5174 本机（.local-data）。
deploy: restart

test:
	npm test

# Vite 生产构建。全仓 tsc 仍有历史债，不挡这条。
build:
	npm run build

# 打包后同时跑云端和本机：先停，再 vite build。无 Vite，两边都直接提供 dist。
# 3141 云端（.cloud-data），3151 本机（.local-data）。
rebuild: stop build
	npm run start:both

# macOS dmg / Windows exe：见 docs/desktop-install.md；CI tag v* 走 GitHub Release
pack:
	npm run electron:pack
