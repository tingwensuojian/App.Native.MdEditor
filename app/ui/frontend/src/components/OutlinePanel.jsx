import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import AnimatedList from './AnimatedList';
import './OutlinePanel.css';

const OutlinePanel = ({ content, onHeadingClick }) => {
  // 解析 Markdown 内容，提取标题
  const headings = useMemo(() => {
    if (!content) return [];
    
    const lines = content.split('\n');
    const result = [];
    
    lines.forEach((line, index) => {
      // 匹配 Markdown 标题 (# 到 ######)
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length; // 1-6
        const text = match[2].trim();
        result.push({
          level,
          text,
          line: index + 1, // 行号从 1 开始
          id: `heading-${index}`
        });
      }
    });
    
    return result;
  }, [content]);

  // 处理标题点击
  const handleHeadingClick = (heading) => {
    if (onHeadingClick) {
      // 直接把完整 heading 对象传给上层，方便联动预览
      onHeadingClick(heading);
    }
  };

  // 获取标题层级的缩进
  const getIndent = (level) => {
    return (level - 1) * 16;
  };

  // 获取标题层级的样式类
  const getLevelClass = (level) => {
    return `outline-item-level-${level}`;
  };

  if (headings.length === 0) {
    return (
      <div className="outline-panel">
        <div className="outline-empty">
          当前文档无标题
        </div>
      </div>
    );
  }

  return (
    <div className="outline-panel">
      <AnimatedList delay={20}>
        {headings.map((heading) => (
          <div
            key={heading.id}
            className={`outline-item ${getLevelClass(heading.level)}`}
            style={{ paddingLeft: `${8 + getIndent(heading.level)}px` }}
            onClick={() => handleHeadingClick(heading)}
            title={`第 ${heading.line} 行`}
          >
            <span className="outline-item-icon">
              <ChevronRight size={14} />
            </span>
            <span className="outline-item-text">{heading.text}</span>
            <span className="outline-item-line">L{heading.line}</span>
          </div>
        ))}
      </AnimatedList>
    </div>
  );
};

// 使用 React.memo 优化性能
export default React.memo(OutlinePanel);
