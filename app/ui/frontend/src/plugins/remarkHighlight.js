/**
 * Remark 插件：支持 ==高亮文本== 语法
 * 将 ==文本== 转换为 <mark>文本</mark>
 */

import { visit } from 'unist-util-visit';

export default function remarkHighlight() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      const { value } = node;
      
      // 匹配 ==文本== 语法
      const regex = /==([^=]+)==/g;
      
      if (!regex.test(value)) {
        return;
      }
      
      const children = [];
      let lastIndex = 0;
      let match;
      
      // 重置正则表达式
      regex.lastIndex = 0;
      
      while ((match = regex.exec(value)) !== null) {
        const matchStart = match.index;
        const matchEnd = regex.lastIndex;
        
        // 添加匹配前的文本
        if (matchStart > lastIndex) {
          children.push({
            type: 'text',
            value: value.slice(lastIndex, matchStart)
          });
        }
        
        // 添加高亮的 HTML 节点
        children.push({
          type: 'html',
          value: `<mark>${match[1]}</mark>`
        });
        
        lastIndex = matchEnd;
      }
      
      // 添加剩余的文本
      if (lastIndex < value.length) {
        children.push({
          type: 'text',
          value: value.slice(lastIndex)
        });
      }
      
      // 替换原节点
      if (children.length > 0) {
        parent.children.splice(index, 1, ...children);
      }
    });
  };
}
