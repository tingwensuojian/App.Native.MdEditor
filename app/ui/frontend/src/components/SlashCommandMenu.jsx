import React, { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import {
  Heading1,
  Bold,
  Italic,
  Strikethrough,
  ListOrdered,
  List,
  CheckSquare,
  Link2,
  Image,
  FileCode,
  Code2,
  Quote,
  Table,
  Minus,
  GripVertical,
  ChevronRight,
} from 'lucide-react'
import './SlashCommandMenu.css'

const HEADING_SUB_COMMANDS = [
  { id: 'heading-1', label: '一级标题', icon: Heading1, before: '# ', after: '', mode: 'heading', keywords: ['h1', '标题1'] },
  { id: 'heading-2', label: '二级标题', icon: Heading1, before: '## ', after: '', mode: 'heading', keywords: ['h2', '标题2'] },
  { id: 'heading-3', label: '三级标题', icon: Heading1, before: '### ', after: '', mode: 'heading', keywords: ['h3', '标题3'] },
  { id: 'heading-4', label: '四级标题', icon: Heading1, before: '#### ', after: '', mode: 'heading', keywords: ['h4', '标题4'] },
  { id: 'heading-5', label: '五级标题', icon: Heading1, before: '##### ', after: '', mode: 'heading', keywords: ['h5', '标题5'] },
  { id: 'heading-6', label: '六级标题', icon: Heading1, before: '###### ', after: '', mode: 'heading', keywords: ['h6', '标题6'] },
]

export const SLASH_COMMANDS = [
  { id: 'heading', label: '标题', icon: Heading1, mode: 'submenu', keywords: ['h1', 'title'], children: HEADING_SUB_COMMANDS },
  { id: 'bold', label: '加粗', icon: Bold, before: '**', after: '**', mode: 'wrap', keywords: ['strong'] },
  { id: 'italic', label: '斜体', icon: Italic, before: '*', after: '*', mode: 'wrap', keywords: ['斜杠', 'italic'] },
  { id: 'strike', label: '删除线', icon: Strikethrough, before: '~~', after: '~~', mode: 'wrap', keywords: ['strikethrough'] },
  { id: 'ordered-list', label: '有序列表', icon: ListOrdered, before: '1. ', after: '', mode: 'line', keywords: ['有序标题', 'ol'] },
  { id: 'unordered-list', label: '无序列表', icon: List, before: '- ', after: '', mode: 'line', keywords: ['无需标题', 'ul'] },
  { id: 'task-list', label: '任务列表', icon: CheckSquare, before: '- [ ] ', after: '', mode: 'line', keywords: ['task'] },
  { id: 'link', label: '链接', icon: Link2, before: '[链接](https://)', after: '', mode: 'insert', keywords: ['url'] },
  { id: 'image', label: '图片', icon: Image, before: '![图片](https://)', after: '', mode: 'insert', keywords: ['img'] },
  { id: 'codeblock', label: '代码块', icon: FileCode, before: '```\n', after: '\n```', mode: 'wrap', keywords: ['code'] },
  { id: 'inline-code', label: '行内代码', icon: Code2, before: '`', after: '`', mode: 'wrap', keywords: ['code'] },
  { id: 'quote', label: '引用', icon: Quote, before: '> ', after: '', mode: 'line', keywords: ['blockquote'] },
  { id: 'table', label: '表格', icon: Table, before: '| 列1 | 列2 |\n|---|---|\n| 内容 | 内容 |', after: '', mode: 'insert', keywords: ['table'] },
  { id: 'hr', label: '分割线', icon: Minus, before: '\n---\n', after: '', mode: 'insert', keywords: ['divider'] },
]

const DEFAULT_ORDER = SLASH_COMMANDS.map((cmd) => cmd.id)

function buildOrderedCommands(orderIds) {
  const idToCmd = new Map(SLASH_COMMANDS.map((cmd) => [cmd.id, cmd]))
  const fromOrder = orderIds
    .map((id) => idToCmd.get(id))
    .filter(Boolean)
  const missing = SLASH_COMMANDS.filter((cmd) => !orderIds.includes(cmd.id))
  return [...fromOrder, ...missing]
}

function SlashCommandMenu({
  visible,
  x,
  y,
  query = '',
  theme = 'light',
  onSelect,
  onClose,
  enableReorder = false,
  commandOrder = [],
  onCommandOrderChange,
  onResetOrder,
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [orderedIds, setOrderedIds] = useState(DEFAULT_ORDER)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [expandedSubmenuId, setExpandedSubmenuId] = useState(null)
  const menuRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState({ left: x, top: y })

  const updateMenuPosition = useCallback(() => {
    const menuEl = menuRef.current
    if (!visible || !menuEl) return

    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const gap = 8
    const preferredOffset = 6

    const menuW = menuEl.offsetWidth
    const menuH = menuEl.offsetHeight

    const minLeft = gap
    const maxLeft = Math.max(gap, viewportW - menuW - gap)
    const nextLeft = Math.min(Math.max(x, minLeft), maxLeft)

    const defaultTop = y
    const aboveTop = y - menuH - preferredOffset
    const hasBottomSpace = defaultTop + menuH <= viewportH - gap
    const hasAboveSpace = aboveTop >= gap

    let nextTop = defaultTop
    if (!hasBottomSpace && hasAboveSpace) {
      nextTop = aboveTop
    } else {
      const minTop = gap
      const maxTop = Math.max(gap, viewportH - menuH - gap)
      nextTop = Math.min(Math.max(defaultTop, minTop), maxTop)
    }

    setMenuPosition((prev) => {
      if (prev.left === nextLeft && prev.top === nextTop) return prev
      return { left: nextLeft, top: nextTop }
    })
  }, [visible, x, y])

  useEffect(() => {
    if (Array.isArray(commandOrder) && commandOrder.length) {
      setOrderedIds(commandOrder)
      return
    }
    setOrderedIds(DEFAULT_ORDER)
  }, [commandOrder])

  const orderedCommands = useMemo(() => buildOrderedCommands(orderedIds), [orderedIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orderedCommands

    const flattened = orderedCommands.flatMap((cmd) => {
      if (!cmd.children?.length) return [cmd]
      return [
        cmd,
        ...cmd.children.map((child) => ({ ...child, parentId: cmd.id, isSubmenuItem: true })),
      ]
    })

    return flattened.filter((cmd) => (
      cmd.label.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q) ||
      cmd.keywords?.some((k) => k.toLowerCase().includes(q))
    ))
  }, [query, orderedCommands])

  const displayItems = useMemo(() => {
    if (query.trim()) return filtered

    const items = []
    filtered.forEach((cmd) => {
      items.push(cmd)
      if (cmd.children?.length && expandedSubmenuId === cmd.id) {
        items.push(...cmd.children.map((child) => ({ ...child, parentId: cmd.id, isSubmenuItem: true })))
      }
    })
    return items
  }, [filtered, expandedSubmenuId, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, visible])

  useEffect(() => {
    if (!visible) return undefined
    const onKeyDown = (e) => {
      if (!displayItems.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((i) => Math.min(i + 1, displayItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        const current = displayItems[activeIndex]
        if (!current) return
        if (current.children?.length) {
          setExpandedSubmenuId((prev) => (prev === current.id ? null : current.id))
          return
        }
        onSelect?.(current)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [visible, displayItems, activeIndex, onSelect, onClose])

  useEffect(() => {
    if (!visible || !menuRef.current) return
    const activeEl = menuRef.current.querySelector('.slash-menu-item.active')
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, visible])

  useLayoutEffect(() => {
    if (!visible) return
    updateMenuPosition()
  }, [visible, x, y, displayItems.length, expandedSubmenuId, query, updateMenuPosition])

  useEffect(() => {
    if (!visible) return undefined

    const onViewportChange = () => {
      updateMenuPosition()
    }

    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)

    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [visible, updateMenuPosition])

  const reorderCommand = (sourceId, targetId) => {
    if (!enableReorder) return
    if (!sourceId || !targetId || sourceId === targetId) return
    setOrderedIds((prev) => {
      const next = [...prev]
      const from = next.indexOf(sourceId)
      const to = next.indexOf(targetId)
      if (from < 0 || to < 0) return prev
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      onCommandOrderChange?.(next)
      return next
    })
  }

  if (!visible) return null

  return (
    <div ref={menuRef} className={`slash-menu theme-${theme}`} style={{ left: menuPosition.left, top: menuPosition.top }}>
      {enableReorder && (
        <div className="slash-menu-header">
          <button
            className="slash-menu-reset-btn"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOrderedIds(DEFAULT_ORDER)
              onResetOrder?.(DEFAULT_ORDER)
            }}
          >
            恢复默认排序
          </button>
        </div>
      )}
      {displayItems.length === 0 && <div className="slash-menu-empty">未找到命令</div>}
      {displayItems.map((cmd, idx) => {
        const Icon = cmd.icon
        const isDragging = draggingId === cmd.id
        const isDragOver = dragOverId === cmd.id
        const isChild = Boolean(cmd.parentId)
        const hasChildren = Boolean(cmd.children?.length)
        const isExpanded = hasChildren && expandedSubmenuId === cmd.id

        return (
          <div
            key={`${cmd.parentId || 'root'}-${cmd.id}`}
            className={`slash-menu-row ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${isChild ? 'submenu-row' : ''}`}
            draggable={enableReorder && !isChild}
            onDragStart={(e) => {
              if (!enableReorder || isChild) return
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', cmd.id)
              setDraggingId(cmd.id)
              setDragOverId(null)
            }}
            onDragOver={(e) => {
              if (!enableReorder || isChild) return
              e.preventDefault()
              if (draggingId && draggingId !== cmd.id) {
                setDragOverId(cmd.id)
              }
            }}
            onDrop={(e) => {
              if (!enableReorder || isChild) return
              e.preventDefault()
              const sourceId = e.dataTransfer.getData('text/plain') || draggingId
              reorderCommand(sourceId, cmd.id)
              setDraggingId(null)
              setDragOverId(null)
            }}
            onDragEnd={() => {
              setDraggingId(null)
              setDragOverId(null)
            }}
          >
            <button
              className={`slash-menu-item ${idx === activeIndex ? 'active' : ''} ${isChild ? 'submenu-item' : ''}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault()
                if (hasChildren) {
                  const willExpand = expandedSubmenuId !== cmd.id
                  setExpandedSubmenuId((prev) => (prev === cmd.id ? null : cmd.id))
                  if (willExpand && !query.trim() && cmd.children?.length) {
                    setActiveIndex(idx + 1)
                  }
                  return
                }
                onSelect?.(cmd)
              }}
            >
              <Icon size={15} />
              <span>{cmd.label}</span>
              {hasChildren && (
                <ChevronRight
                  size={14}
                  className={`slash-submenu-arrow ${isExpanded ? 'expanded' : ''}`}
                />
              )}
            </button>
            {enableReorder && !isChild && (
              <div
                className="slash-item-order-actions"
                title="拖拽排序"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <GripVertical size={14} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default SlashCommandMenu
