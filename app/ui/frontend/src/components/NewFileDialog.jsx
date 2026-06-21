import React, { useState, useCallback } from 'react';
import { FileText, StickyNote, FileCheck, Pen, ListTodo, Calendar } from 'lucide-react';
import { DEFAULT_DOCUMENT_CONTENT } from '../constants/defaultDocument';
import './Dialog.css';
import './NewFileDialog.css';

const TEMPLATES = [
  {
    id: 'blank',
    name: '空白文档',
    description: '创建一个带默认展示内容的 Markdown 文件',
    content: DEFAULT_DOCUMENT_CONTENT
  },
  {
    id: 'note',
    name: '笔记',
    description: '适合日常笔记和记录',
    content: `# 笔记标题

**日期**: ${new Date().toLocaleDateString('zh-CN')}

## 内容

在这里记录你的想法...

## 标签

#标签1 #标签2
`
  },
  {
    id: 'document',
    name: '文档',
    description: '适合正式文档和报告',
    content: `# 文档标题

**作者**: 
**日期**: ${new Date().toLocaleDateString('zh-CN')}
**版本**: 1.0

## 摘要

简要描述文档内容...

## 目录

- [第一章](#第一章)
- [第二章](#第二章)
- [第三章](#第三章)

## 第一章

内容...

## 第二章

内容...

## 第三章

内容...

## 参考文献

1. 参考资料1
2. 参考资料2
`
  },
  {
    id: 'blog',
    name: '博客文章',
    description: '适合博客和技术文章',
    content: `---
title: 文章标题
date: ${new Date().toISOString().split('T')[0]}
tags: [标签1, 标签2]
categories: [分类]
---

# 文章标题

## 引言

在这里写引言...

## 正文

### 小节1

内容...

### 小节2

内容...

## 总结

总结内容...

## 参考链接

- [链接1](https://example.com)
- [链接2](https://example.com)
`
  },
  {
    id: 'todo',
    name: '待办清单',
    description: '任务和待办事项管理',
    content: `# 待办清单

**日期**: ${new Date().toLocaleDateString('zh-CN')}

## 今日任务

- [ ] 任务1
- [ ] 任务2
- [ ] 任务3

## 本周计划

- [ ] 计划1
- [ ] 计划2
- [ ] 计划3

## 已完成

- [x] 已完成的任务1
- [x] 已完成的任务2

## 备注

其他需要记录的内容...
`
  },
  {
    id: 'meeting',
    name: '会议记录',
    description: '会议纪要和讨论记录',
    content: `# 会议记录

**日期**: ${new Date().toLocaleDateString('zh-CN')}
**时间**: 
**地点**: 
**参会人员**: 

## 会议议程

1. 议题1
2. 议题2
3. 议题3

## 讨论内容

### 议题1

讨论内容...

**决议**: 

### 议题2

讨论内容...

**决议**: 

### 议题3

讨论内容...

**决议**: 

## 行动项

- [ ] 行动项1 - 负责人: XXX - 截止日期: YYYY-MM-DD
- [ ] 行动项2 - 负责人: XXX - 截止日期: YYYY-MM-DD

## 下次会议

**时间**: 
**议题**: 
`
  }
];

const NewFileDialog = ({ onClose, onConfirm, rootDirs, theme }) => {
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [isClosing, setIsClosing] = useState(false);

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplate(templateId);
  };

  const createFileFromTemplate = () => {
    // 获取模板内容
    const template = TEMPLATES.find(t => t.id === selectedTemplate);
    const content = template ? template.content : '';

    // 只传递内容给父组件，不需要文件名
    // 文件名和保存位置将在用户保存时填写
    onConfirm(content);
    requestClose();
  };

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 180);
  }, [isClosing, onClose]);

  const handleOverlayClick = () => {
    requestClose();
  };

  const handleCloseClick = () => {
    requestClose();
  };

  const handleCancelClick = () => {
    requestClose();
  };

  const handleConfirmClick = () => {
    createFileFromTemplate();
  };

  const selectedTemplateData = TEMPLATES.find(t => t.id === selectedTemplate);

  return (
    <div className={`dialog-overlay compact-panel-overlay new-file-dialog-overlay theme-${theme} ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className="dialog-container compact-panel-dialog new-file-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>新建文件</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>

        <div className="dialog-body">
          <div className="form-group">
            <label>选择模板</label>
            <div className="template-grid">
              {TEMPLATES.map(template => {
                const getIcon = () => {
                  switch(template.id) {
                    case 'blank': return <FileText size={32} />
                    case 'note': return <StickyNote size={32} />
                    case 'document': return <FileCheck size={32} />
                    case 'blog': return <Pen size={32} />
                    case 'todo': return <ListTodo size={32} />
                    case 'meeting': return <Calendar size={32} />
                    default: return <FileText size={32} />
                  }
                }

                return (
                  <div
                    key={template.id}
                    className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <div className="template-icon">
                      {getIcon()}
                    </div>
                    <div className="template-info">
                      <h4>{template.name}</h4>
                      <p>{template.description}</p>
                    </div>
                    {selectedTemplate === template.id && (
                      <div className="template-check">✓</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={handleCancelClick}>取消</button>
          <button
            className="btn-primary"
            onClick={handleConfirmClick}
          >
            创建并编辑
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewFileDialog;

