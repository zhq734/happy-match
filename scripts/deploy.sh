#!/usr/bin/env bash
# 一键部署开心消消乐到 GitHub Pages。
# 创建者：zhenghq
set -euo pipefail

REPO_NAME="${REPO_NAME:-happy-match}"
BRANCH="main"

cd "$(dirname "$0")/.."

echo "==> 构建生产产物"
npm run build

echo "==> 初始化 Git 仓库"
if [ ! -d .git ]; then
  git init -q
fi
git symbolic-ref HEAD refs/heads/$BRANCH 2>/dev/null || true

echo "==> 暂存并提交"
git add -A
if git diff --cached --quiet; then
  echo "没有需要提交的改动"
else
  git commit -q -m "feat: 开心消消乐多关卡多玩法三消游戏"
fi

echo "==> 创建远程仓库（已存在则跳过）"
OWNER="$(gh api user --jq .login)"
if ! gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
  git push -u origin "$BRANCH"
fi

echo "==> 开启 GitHub Pages（从 Actions 部署）"
gh api -X POST "repos/$OWNER/$REPO_NAME/pages" \
  -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1 \
  || gh api -X PUT "repos/$OWNER/$REPO_NAME/pages" \
     -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null 2>&1 \
  || echo "（Pages 可能已配置，稍后由工作流完成部署）"

echo "==> 完成"
echo "仓库地址: https://github.com/$OWNER/$REPO_NAME"
echo "预览地址: https://$OWNER.github.io/$REPO_NAME/"
