import { combineExtensions } from 'micromark-util-combine-extensions'
import { gfmFootnote } from 'micromark-extension-gfm-footnote'
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough'
import { gfmTable } from 'micromark-extension-gfm-table'
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item'
import { gfmFootnoteFromMarkdown, gfmFootnoteToMarkdown } from 'mdast-util-gfm-footnote'
import { gfmStrikethroughFromMarkdown, gfmStrikethroughToMarkdown } from 'mdast-util-gfm-strikethrough'
import { gfmTableFromMarkdown, gfmTableToMarkdown } from 'mdast-util-gfm-table'
import { gfmTaskListItemFromMarkdown, gfmTaskListItemToMarkdown } from 'mdast-util-gfm-task-list-item'

// 兼容版 GFM 插件：
// - 保留表格、脚注、删除线、任务列表
// - 显式移除 autolink literal（www / email 自动链接）
//   以避免 iOS 16.3 Safari 解析其 lookbehind 正则时直接白屏。
export default function remarkGfmCompat(options) {
  const settings = options || {}
  const data = this.data()

  const micromarkExtensions =
    data.micromarkExtensions || (data.micromarkExtensions = [])
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions || (data.fromMarkdownExtensions = [])
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = [])

  micromarkExtensions.push(
    combineExtensions([
      gfmFootnote(),
      gfmStrikethrough(settings),
      gfmTable(),
      gfmTaskListItem()
    ])
  )

  fromMarkdownExtensions.push([
    gfmFootnoteFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    gfmTaskListItemFromMarkdown()
  ])

  toMarkdownExtensions.push({
    extensions: [
      gfmFootnoteToMarkdown(settings),
      gfmStrikethroughToMarkdown(),
      gfmTableToMarkdown(settings),
      gfmTaskListItemToMarkdown()
    ]
  })
}
