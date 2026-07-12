!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "欢迎安装 ${PRODUCT_NAME}"
  !define MUI_WELCOMEPAGE_TEXT "安装完成后，首次启动向导会自动准备运行环境，并请你确认本地数据目录。$\r$\n$\r$\n项目、配置以及生成的图片和视频默认只保存在本机；应用升级不会覆盖这些数据，卸载时也不会自动删除。$\r$\n$\r$\n建议预留至少 10 GB 可用空间。"
  !insertmacro MUI_PAGE_WELCOME
!macroend
