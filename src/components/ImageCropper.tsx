'use client';

import React, { useEffect, useRef, useState } from 'react';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropperProps {
  imageSrc: string;
  targetAspectRatio?: number; // 默认为1 (正方形)
  onCropComplete: (cropArea: CropArea) => void;
  onCancel: () => void;
}

const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  targetAspectRatio = 1,
  onCropComplete,
  onCancel
}) => {
  // 状态
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [cropParams, setCropParams] = useState<{
    scale: number;
    offset: { x: number; y: number };
  }>({ scale: 1, offset: { x: 0, y: 0 } });
  
  // ++ 存储实际宽高比以便正确处理 ++
  const [actualTargetAspectRatio, setActualTargetAspectRatio] = useState<number>(targetAspectRatio);

  // Refs
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const dragInfoRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
    lastPinchDistance?: number; // 用于双指捏合
  } | null>(null);

  // 初始化图片尺寸和位置
  useEffect(() => {
    if (!imageSrc) return;

    const img = new Image();
    img.onload = () => {
      console.log('Image dimensions:', img.naturalWidth, img.naturalHeight);
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      
      // ++ 更新实际宽高比 ++
      if (targetAspectRatio === 1) {
        // 如果传入的是默认值1，则计算一个更合适的宽高比
        const imageRatio = img.naturalWidth / img.naturalHeight;
        // 防止长图裁剪框过窄，或宽图裁剪框过矮
        if (imageRatio > 2) {
          // 宽图片，使用4:3宽高比
          setActualTargetAspectRatio(4/3);
        } else if (imageRatio < 0.5) {
          // 长图片，使用3:4宽高比
          setActualTargetAspectRatio(3/4);
        } else {
          // 使用图片的原始宽高比
          setActualTargetAspectRatio(imageRatio);
        }
      } else {
        // 使用传入的目标宽高比
        setActualTargetAspectRatio(targetAspectRatio);
      }
      
      resetCropParams(img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
      console.error("无法加载图片以获取尺寸");
    };
    img.src = imageSrc;
  }, [imageSrc, targetAspectRatio]);

  // 重置裁剪参数
  const resetCropParams = (imgWidth?: number, imgHeight?: number) => {
    const container = previewContainerRef.current;
    const imageW = imgWidth ?? imageDimensions?.width;
    const imageH = imgHeight ?? imageDimensions?.height;

    if (!container || !imageW || !imageH) {
      setCropParams({ scale: 1, offset: { x: 0, y: 0 } });
      return;
    }

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // 计算初始缩放比例，使图片适应容器 (contain)
    const scaleX = containerWidth / imageW;
    const scaleY = containerHeight / imageH;
    const initialScale = Math.min(scaleX, scaleY) * 0.9; // 稍微小一点，让用户看到边缘

    // 计算初始偏移量，使图片在容器中居中
    const initialOffsetX = (containerWidth - imageW * initialScale) / 2;
    const initialOffsetY = (containerHeight - imageH * initialScale) / 2;

    setCropParams({
      scale: initialScale,
      offset: { x: initialOffsetX, y: initialOffsetY },
    });

    // 重置拖动状态
    if (previewImageRef.current) previewImageRef.current.style.cursor = 'grab';
    dragInfoRef.current = null;
  };

  // 获取指针位置（鼠标或触摸）
  const getPointerPosition = (event: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } => {
    const touch = 'touches' in event ? event.touches[0] : null;
    const clientX = touch ? touch.clientX : ('clientX' in event ? event.clientX : 0);
    const clientY = touch ? touch.clientY : ('clientY' in event ? event.clientY : 0);
    return { x: clientX, y: clientY };
  };

  // 鼠标按下 / 触摸开始
  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleDragStart(event);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    // 如果是双指触摸，准备缩放
    if (event.touches.length === 2) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      dragInfoRef.current = {
        isDragging: false,
        startX: 0,
        startY: 0,
        startOffset: { ...cropParams.offset },
        lastPinchDistance: distance
      };
      return;
    }
    
    // 单指触摸，准备拖动
    if (event.touches.length === 1) {
      handleDragStart(event);
    }
  };

  const handleDragStart = (event: React.MouseEvent | React.TouchEvent) => {
    const pointer = getPointerPosition(event);
    if (previewImageRef.current) previewImageRef.current.style.cursor = 'grabbing';
    
    dragInfoRef.current = {
      isDragging: true,
      startX: pointer.x,
      startY: pointer.y,
      startOffset: { ...cropParams.offset },
    };
  };

  // 鼠标移动 / 触摸移动
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleDragMove(event);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    // 处理双指缩放
    if (event.touches.length === 2 && dragInfoRef.current?.lastPinchDistance) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      
      // 计算新的距离
      const newDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      // 计算缩放比例变化
      const scaleFactor = newDistance / dragInfoRef.current.lastPinchDistance;
      const newScale = Math.max(0.1, Math.min(cropParams.scale * scaleFactor, 10));
      
      // 计算两指中心点
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      
      // 获取容器位置
      const containerRect = previewContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      
      // 计算中心点相对于容器的位置
      const relativeX = centerX - containerRect.left;
      const relativeY = centerY - containerRect.top;
      
      // 计算缩放中心点相对于图片左上角的坐标
      const imageX = (relativeX - cropParams.offset.x) / cropParams.scale;
      const imageY = (relativeY - cropParams.offset.y) / cropParams.scale;
      
      // 计算新偏移量，使缩放中心保持在原位置
      const newOffsetX = relativeX - imageX * newScale;
      const newOffsetY = relativeY - imageY * newScale;
      
      setCropParams({
        scale: newScale,
        offset: { x: newOffsetX, y: newOffsetY },
      });
      
      // 更新最后的捏合距离
      dragInfoRef.current.lastPinchDistance = newDistance;
      return;
    }
    
    // 单指拖动
    if (event.touches.length === 1) {
      handleDragMove(event);
    }
  };

  const handleDragMove = (event: React.MouseEvent | React.TouchEvent) => {
    if (!dragInfoRef.current?.isDragging) return;
    
    const pointer = getPointerPosition(event);
    const dx = pointer.x - dragInfoRef.current.startX;
    const dy = pointer.y - dragInfoRef.current.startY;

    setCropParams(prev => ({
      ...prev,
      offset: {
        x: dragInfoRef.current!.startOffset.x + dx,
        y: dragInfoRef.current!.startOffset.y + dy,
      },
    }));
  };

  // 鼠标松开 / 触摸结束 / 鼠标移出
  const handleMouseUp = () => {
    handleDragEnd();
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  const handleMouseLeave = () => {
    if (dragInfoRef.current?.isDragging) {
      handleDragEnd();
    }
  };

  const handleDragEnd = () => {
    if (previewImageRef.current) previewImageRef.current.style.cursor = 'grab';
    dragInfoRef.current = null;
  };

  // 鼠标滚轮缩放
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!previewContainerRef.current) return;

    const delta = event.deltaY * -0.01; // 调整缩放速度
    const newScale = Math.max(0.1, Math.min(cropParams.scale * (1 + delta), 10));

    const containerRect = previewContainerRef.current.getBoundingClientRect();
    const mouseX = event.clientX - containerRect.left;
    const mouseY = event.clientY - containerRect.top;

    // 计算缩放中心点相对于图片左上角的坐标
    const imageX = (mouseX - cropParams.offset.x) / cropParams.scale;
    const imageY = (mouseY - cropParams.offset.y) / cropParams.scale;

    // 计算新偏移量，使缩放中心保持在鼠标位置
    const newOffsetX = mouseX - imageX * newScale;
    const newOffsetY = mouseY - imageY * newScale;

    setCropParams({
      scale: newScale,
      offset: { x: newOffsetX, y: newOffsetY },
    });
  };

  // 确认裁剪
  const handleConfirmCrop = () => {
    if (!imageDimensions || !previewContainerRef.current || !cropFrameRef.current) {
      console.error("无法确认裁剪，缺少必要参数或引用。");
      return;
    }

    const container = previewContainerRef.current;
    const frame = cropFrameRef.current;
    const { scale, offset } = cropParams;
    const { width: imgWidth, height: imgHeight } = imageDimensions;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // 获取裁剪框的实际尺寸（考虑到可能使用 padding-bottom 来维持比例）
    const frameRect = frame.getBoundingClientRect();
    const frameWidth = frameRect.width;
    const frameHeight = frameRect.height;
    
    // 计算裁剪框在容器内的中心点
    const frameTop = (containerHeight - frameHeight) / 2;
    const frameLeft = (containerWidth - frameWidth) / 2;

    // 1. 将裁剪框的左上角坐标 (相对于容器) 转换成相对于缩放后图片的坐标
    const frameImageX = (frameLeft - offset.x) / scale;
    const frameImageY = (frameTop - offset.y) / scale;

    // 2. 计算裁剪框在缩放后图片上的宽度和高度
    const frameImageWidth = frameWidth / scale;
    const frameImageHeight = frameHeight / scale;

    // 3. 将这些坐标和尺寸转换成相对于原始图片的比例 (0-1)
    const relativeX = Math.max(0, frameImageX / imgWidth);
    const relativeY = Math.max(0, frameImageY / imgHeight);
    const relativeWidth = Math.min(1 - relativeX, frameImageWidth / imgWidth);
    const relativeHeight = Math.min(1 - relativeY, frameImageHeight / imgHeight);

    // 确保裁剪区域有效
    if (relativeWidth <= 0 || relativeHeight <= 0) {
      console.error("计算出的裁剪区域无效 (宽度或高度为0或负值)。");
      alert("裁剪区域无效，请调整。");
      return;
    }

    const cropArea = {
      x: relativeX,
      y: relativeY,
      width: relativeWidth,
      height: relativeHeight,
    };

    console.log("Confirmed Crop Area (relative):", cropArea);
    onCropComplete(cropArea);
  };

  return (
    <div className="w-full max-w-xl bg-white p-4 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-700 mb-3 text-center">调整图片区域</h3>
      <p className="text-xs text-center text-gray-500 mb-4">
        拖动图片进行平移，使用鼠标滚轮或双指捏合进行缩放，尽量让边框对齐网格线。
      </p>

      {/* 预览容器 */}
      <div
        ref={previewContainerRef}
        className="relative w-full h-64 sm:h-80 bg-gray-200 overflow-hidden cursor-grab rounded mb-4"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 原始图片 */}
        {imageDimensions && (
          <img
            ref={previewImageRef}
            src={imageSrc}
            alt="Preview"
            className="absolute top-0 left-0 select-none"
            style={{
              width: `${imageDimensions.width * cropParams.scale}px`,
              height: `${imageDimensions.height * cropParams.scale}px`,
              transform: `translate(${cropParams.offset.x}px, ${cropParams.offset.y}px)`,
              maxWidth: 'none',
              cursor: 'grab',
            }}
            draggable="false"
          />
        )}
        
        {/* 裁剪框 */}
        <div
          ref={cropFrameRef}
          className="absolute top-1/2 left-1/2 border-2 border-dashed border-white pointer-events-none"
          style={{
            transform: 'translate(-50%, -50%)',
            width: '80%',
            paddingBottom: `${80 / actualTargetAspectRatio}%`, 
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
          }}
        ></div>
      </div>

      {/* 按钮组 */}
      <div className="flex justify-center gap-4">
        <button
          onClick={handleConfirmCrop}
          className="py-2 px-6 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          确认选区
        </button>
        <button
          onClick={() => resetCropParams()}
          className="py-2 px-4 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm"
        >
          重置
        </button>
        <button
          onClick={onCancel}
          className="py-2 px-4 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
};

export default ImageCropper; 