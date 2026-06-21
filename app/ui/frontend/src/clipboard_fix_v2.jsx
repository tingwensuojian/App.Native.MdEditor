  const handleMenuCopy = async () => {
    if (editorRef.current) {
      editorRef.current.focus()
      const selection = editorRef.current.getSelection()
      const selectedText = editorRef.current.getModel().getValueInRange(selection)
      
      if (selectedText) {
        try {
          // 检查 Clipboard API 是否可用
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(selectedText)
            setStatus('已复制')
            setTimeout(() => setStatus('就绪'), 1000)
          } else {
            // 降级方案：使用传统的 document.execCommand
            const textarea = document.createElement('textarea')
            textarea.value = selectedText
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.select()
            const success = document.execCommand('copy')
            document.body.removeChild(textarea)
            
            if (success) {
              setStatus('已复制')
              setTimeout(() => setStatus('就绪'), 1000)
            } else {
              setStatus('复制失败，请使用 Ctrl+C')
              setTimeout(() => setStatus('就绪'), 2000)
            }
          }
        } catch (err) {
          console.error('复制失败:', err)
          setStatus('复制失败，请使用 Ctrl+C')
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
          // 检查 Clipboard API 是否可用
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(selectedText)
            editorRef.current.executeEdits('cut', [{
              range: selection,
              text: '',
              forceMoveMarkers: true
            }])
            setStatus('已剪切')
            setTimeout(() => setStatus('就绪'), 1000)
          } else {
            // 降级方案：使用传统的 document.execCommand
            const textarea = document.createElement('textarea')
            textarea.value = selectedText
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.select()
            const success = document.execCommand('copy')
            document.body.removeChild(textarea)
            
            if (success) {
              editorRef.current.executeEdits('cut', [{
                range: selection,
                text: '',
                forceMoveMarkers: true
              }])
              setStatus('已剪切')
              setTimeout(() => setStatus('就绪'), 1000)
            } else {
              setStatus('剪切失败，请使用 Ctrl+X')
              setTimeout(() => setStatus('就绪'), 2000)
            }
          }
        } catch (err) {
          console.error('剪切失败:', err)
          setStatus('剪切失败，请使用 Ctrl+X')
          setTimeout(() => setStatus('就绪'), 2000)
        }
      }
    }
  }

  const handleMenuPaste = async () => {
    if (editorRef.current) {
      editorRef.current.focus()
      
      try {
        // 检查 Clipboard API 是否可用
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText()
          if (text) {
            const selection = editorRef.current.getSelection()
            editorRef.current.executeEdits('paste', [{
              range: selection,
              text: text,
              forceMoveMarkers: true
            }])
            setStatus('已粘贴')
            setTimeout(() => setStatus('就绪'), 1000)
          }
        } else {
          // 降级方案：提示用户使用快捷键
          setStatus('请使用 Ctrl+V 粘贴')
          setTimeout(() => setStatus('就绪'), 2000)
        }
      } catch (err) {
        console.error('粘贴失败:', err)
        setStatus('请使用 Ctrl+V 粘贴')
        setTimeout(() => setStatus('就绪'), 2000)
      }
    }
  }

