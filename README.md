# 今晚吃什么

两人用的饭店转盘。页面是纯静态的，饭店名单、抽取状态和吃过记录保存在各自浏览器的 `localStorage` 中；换设备或浏览器时可用页面右上角的备份菜单导出、导入数据。

## 本地预览

在仓库目录执行：

```sh
python3 -m http.server 8765 --directory dist
```

打开 <http://127.0.0.1:8765/>。修改 `dist/` 中的文件并刷新页面即可查看效果。

## GitHub Pages

仓库的 `.github/workflows/pages.yml` 会在 `dist/` 或工作流文件推送到 `main` 后发布 `dist/`。首次发布时，在 GitHub 仓库的 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。之后也可以在 **Actions → Publish website** 手动触发发布。

GitHub Pages 使用独立域名，因此原站点或本地预览里的浏览器数据不会自动出现在新地址；如需带过去，请在原地址导出备份，在新地址导入。
