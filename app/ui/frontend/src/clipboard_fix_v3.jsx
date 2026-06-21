  const handleMenuCopy = () => {
    if (editorRef.current) {
      editorRef.current.focus()
      // 模拟 Ctrl+C 键盘事件
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        code: 'KeyC',
        ctrlKey: true,
        metaKey: false,
        bubbles: true,
        cancelable: true
      })
      editorRef.current.getDomNode().dispatchEvent(event)
    }
  }

  const handleMenuCut = () => {
    if (editorRef.current) {
      editorRef.current.focus()
      // 模拟 Ctrl+X 键盘事件
      const event = new KeyboardEvent('keydown', {
        key: 'x',
        code: 'KeyX',
        ctrlKey: true,
        metaKey: false,
        bubbles: true,
        cancelable: true
      })
      editorRef.current.getDomNode().dispatchEvent(event)
    }
  }

  const handleMenuPaste = () => {
    if (editorRef.current) {
      editorRef.current.focus()
      // 模拟 Ctrl+V 键盘事件
      const event = new KeyboardEvent('keydown', {
        key: 'v',
        code: 'KeyV',
        ctrlKey: true,
        metaKey: false,
        bubbles: true,
        cancelable: true
      })
      editorRef.current.getDomNode().dispatchEvent(event)
    }
  }

