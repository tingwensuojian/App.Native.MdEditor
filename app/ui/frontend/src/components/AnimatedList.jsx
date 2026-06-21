import React, { useEffect, useRef, useState } from 'react';
import './AnimatedList.css';

/**
 * AnimatedList - 带动画效果的列表组件
 * 灵感来自 https://react-bits.nodejs.cn/components/animated-list
 * 
 * 优化: 只在初始加载时播放动画，避免展开/折叠时的抖动
 */
const AnimatedList = ({ children, className = '', delay = 50, animateOnChange = false }) => {
  const [visibleItems, setVisibleItems] = useState([]);
  const [hasAnimated, setHasAnimated] = useState(false);
  const itemsRef = useRef([]);

  useEffect(() => {
    // 如果已经动画过且不需要每次都动画，直接显示所有项
    if (hasAnimated && !animateOnChange) {
      const childArray = React.Children.toArray(children);
      setVisibleItems(childArray.map((_, index) => index));
      return;
    }

    // 重置可见项
    setVisibleItems([]);
    itemsRef.current = [];

    // 逐个显示子元素
    const childArray = React.Children.toArray(children);
    const timers = [];
    
    childArray.forEach((child, index) => {
      const timer = setTimeout(() => {
        setVisibleItems(prev => [...prev, index]);
      }, index * delay);
      timers.push(timer);
    });

    // 标记已完成动画
    const finalTimer = setTimeout(() => {
      setHasAnimated(true);
    }, childArray.length * delay + 300);
    timers.push(finalTimer);

    // 清理定时器
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [children, delay, animateOnChange, hasAnimated]);

  const childArray = React.Children.toArray(children);

  return (
    <div className={`animated-list ${className}`}>
      {childArray.map((child, index) => (
        <div
          key={child.key || index}
          className={`animated-list-item ${visibleItems.includes(index) ? 'visible' : ''}`}
        >
          {child}
        </div>
      ))}
    </div>
  );
};

export default AnimatedList;
