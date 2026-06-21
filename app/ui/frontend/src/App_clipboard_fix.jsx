  const handleMenuCopy = async () => {
    if (editorRef.current) {
      editorRef.current.focus()
      const selection = editorRef.current.getSelection()
      const selectedText = editorRef.current.getModel().getValueInRange(selection)
      
      if (selectedText) {
        try {
          await navigator.clipboard.writeText(selectedText)
        } catch (err) {
          console.error('复制失败:', err)
          setStatus('复制失败')
          setTimeout(() => setStatus('就绪'), 2000)
        }
      }
    }
  }

  const handleMenuCut = async () => {
    if (editorRef.current) {
      editorRef.current.focus()
      const selection = editorRef.current.getSelection()
      const selectedText = editorRef.current.getModel().getValueInRange(selection)
      
      if (selectedText) {
        try {
          await navigator.clipboard.writeText(selectedText)
          editorRef.current.executeEdits('cut', [{
            range: selection,
            text: '',
            forceMoveMarkers: true
          }])
        } catch (err) {
          console.error('剪切失败:', err)
          setStatus('剪切失败')
          setTimeout(() => setStatus('就绪'), 2000)
        }
      }
    }
  }

  const handleMenuPaste = async () => {
    if (editorRef.current) {
      editorRef.current.focus()
      
      try {
        const text = await navigator.clipboard.readText()
        if (text) {
          const selection = editorRef.current.getSelection()
          editorRef.current.executeEdits('paste', [{
            range: selection,
            text: text,
            forceMoveMarkers: true
          }])
        }
      } catch (err) {
        console.error('粘贴失败:', err)
        setStatus('粘贴失败，请检查剪贴板权限')
        setTimeout(() => setStatus('就绪'), 2000)
      }
    }
  }

