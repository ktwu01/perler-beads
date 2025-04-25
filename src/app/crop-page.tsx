'use client';

import React, { useState, useRef, ChangeEvent, DragEvent, useEffect, useMemo } from 'react';
import Script from 'next/script';
import ImageCropper from '../components/ImageCropper';
import Link from 'next/link';

// 导入所需接口
interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function CropPage() {
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [granularity, setGranularity] = useState<number>(50); // 默认值，保留用于传递给主页面

  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);

  // 从原始图像的宽高比计算目标裁剪框的宽高比
  const targetAspectRatio = useMemo(() => {
    if (!originalImageSrc) return 1; // 默认正方形
    
    const image = new Image();
    image.src = originalImageSrc;
    
    // 创建一个延迟解析的 Promise
    const calculateRatio = new Promise<number>((resolve) => {
      image.onload = () => {
        // 使用固定的granularity值50来计算裁剪框的比例
        const defaultGranularity = 50;
        const imageAspectRatio = image.height / image.width;
        resolve(defaultGranularity / Math.max(1, Math.round(defaultGranularity * imageAspectRatio)));
      };
      image.onerror = () => resolve(1); // 出错时使用默认值
    });
    
    return 1; // 初始返回1，实际值会在onload后通过状态更新
  }, [originalImageSrc]); // 移除granularity依赖，因为我们使用固定值

  // 处理文件选择
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // 处理拖放
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        processFile(file);
      } else {
        alert("请拖放图片文件 (JPG, PNG)");
      }
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // 处理文件
  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setOriginalImageSrc(result);
      setIsCropping(true);
      setCroppedImageSrc(null);
      setCropArea(null);
    };
    reader.onerror = () => {
      console.error("文件读取失败");
      alert("无法读取文件。");
    };
    reader.readAsDataURL(file);
  };

  // 处理裁剪完成
  const handleCropComplete = (area: CropArea) => {
    console.log("Crop complete with area:", area);
    setCropArea(area);
    setIsCropping(false);
    
    // 应用裁剪并生成新图像
    if (originalImageSrc) {
      applyCrop(originalImageSrc, area);
    }
  };

  // 应用裁剪区域到图像
  const applyCrop = (imageSrc: string, area: CropArea) => {
    const canvas = originalCanvasRef.current;
    if (!canvas) return;
    
    const img = new Image();
    img.onload = () => {
      // 计算实际裁剪坐标和尺寸
      const cropX = Math.floor(area.x * img.width);
      const cropY = Math.floor(area.y * img.height);
      const cropWidth = Math.floor(area.width * img.width);
      const cropHeight = Math.floor(area.height * img.height);
      
      // 设置canvas尺寸为裁剪区域的尺寸
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      
      // 获取上下文并绘制裁剪区域
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight, // 源区域
        0, 0, cropWidth, cropHeight          // 目标区域
      );
      
      // 将结果转换为DataURL
      const croppedDataUrl = canvas.toDataURL('image/png');
      setCroppedImageSrc(croppedDataUrl);
    };
    img.src = imageSrc;
  };

  // 处理横轴格子数变化 (保留函数，但不在UI中使用)
  const handleGranularityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newGranularity = parseInt(event.target.value, 10);
    setGranularity(newGranularity);
  };

  // 处理重新裁剪
  const handleReCrop = () => {
    setIsCropping(true);
  };

  // 处理取消裁剪
  const handleCancelCrop = () => {
    setIsCropping(false);
    if (!cropArea) {
      // 如果之前没有裁剪区域，则重置整个流程
      setOriginalImageSrc(null);
    }
  };

  // 进入像素化处理页面
  const handleProceedToPixelate = () => {
    if (!croppedImageSrc || !cropArea) return;
    
    // 将裁剪后的图像和网格尺寸保存到 localStorage
    localStorage.setItem('croppedImage', croppedImageSrc);
    localStorage.setItem('granularity', granularity.toString());
    
    // 跳转到主处理页面
    window.location.href = "/"; // 或者可以使用 Next.js 的路由导航
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 flex flex-col items-center bg-gray-50 font-[family-name:var(--font-geist-sans)]">
      <header className="w-full max-w-4xl text-center mt-6 mb-5 sm:mt-8 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">拼豆底稿生成器</h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600">上传图片，裁剪区域，生成带色号的图纸和统计</p>
      </header>

      <main className="w-full max-w-4xl flex flex-col items-center space-y-5 sm:space-y-6 relative">
        {/* 隐藏的 canvas 用于处理裁剪 */}
        <canvas ref={originalCanvasRef} className="hidden"></canvas>
        
        {/* 图片上传区域 */}
        {!originalImageSrc && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 sm:p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors w-full max-w-md flex flex-col justify-center items-center"
            style={{ minHeight: '130px' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mb-2 sm:mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs sm:text-sm text-gray-500">拖放图片到此处，或<span className="font-medium text-blue-600">点击选择文件</span></p>
            <p className="text-xs text-gray-400 mt-1">支持 JPG, PNG 格式</p>
          </div>
        )}
        <input type="file" accept="image/jpeg, image/png" onChange={handleFileChange} ref={fileInputRef} className="hidden" />

        {/* 裁剪界面 - 移除横轴格子数滑块 */}
        {originalImageSrc && isCropping && (
          <div className="w-full flex flex-col items-center space-y-5">
            <ImageCropper
              imageSrc={originalImageSrc}
              targetAspectRatio={targetAspectRatio}
              onCropComplete={handleCropComplete}
              onCancel={handleCancelCrop}
            />
          </div>
        )}

        {/* 裁剪结果预览 */}
        {originalImageSrc && croppedImageSrc && !isCropping && (
          <div className="w-full max-w-2xl flex flex-col items-center">
            <div className="bg-white p-4 rounded-lg shadow w-full">
              <h3 className="text-lg font-semibold text-gray-700 mb-3 text-center">裁剪结果预览</h3>
              
              <div className="flex justify-center mb-4 bg-gray-100 p-2 rounded overflow-hidden">
                <img
                  src={croppedImageSrc}
                  alt="Cropped Preview"
                  className="max-w-full h-auto border border-gray-300 rounded"
                  style={{ maxHeight: '400px' }}
                />
              </div>
              
              <div className="flex justify-center gap-4">
                <button
                  onClick={handleReCrop}
                  className="py-2 px-4 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                >
                  重新裁剪
                </button>
                <button
                  onClick={handleProceedToPixelate}
                  className="py-2 px-6 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  开始像素化处理
                </button>
              </div>
              <p className="text-xs text-center text-gray-500 mt-3">
                横轴格子数将设为 {granularity}，可在下一步调整。
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full max-w-4xl mt-10 mb-6 py-4 text-center text-xs sm:text-sm text-gray-500 border-t border-gray-200">
        <p>
          拼豆底稿生成器 &copy; {new Date().getFullYear()}
        </p>
        <p className="mt-1">
          <Link href="/" className="text-blue-600 hover:underline">返回标准模式</Link>
        </p>
      </footer>
    </div>
  );
} 