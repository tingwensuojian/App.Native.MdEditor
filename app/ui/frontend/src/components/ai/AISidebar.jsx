import React, { useCallback } from 'react'
import AIDialog from './AIDialog'

export default function AISidebar({ isOpen, onClose, autoQuickCommandId, onConsumeAutoQuickCommand, getEditorContent, getSelectedText, onInsertImage, onInsertText, onOpenImageManager }) {
  const handleOpenImageManager = useCallback((tab) => {
    onOpenImageManager?.(tab)
  }, [onOpenImageManager])

  const handleInsertImage = useCallback((url) => {
    if (onInsertImage) {
      onInsertImage(`![AI生成](${url})`)
    }
  }, [onInsertImage])

  return (
    <AIDialog
      isOpen={isOpen}
      onClose={onClose}
      autoQuickCommandId={autoQuickCommandId}
      onConsumeAutoQuickCommand={onConsumeAutoQuickCommand}
      getEditorContent={getEditorContent}
      getSelectedText={getSelectedText}
      onInsertImage={handleInsertImage}
      onInsertText={onInsertText}
      onOpenImageManager={handleOpenImageManager}
    />
  )
}
