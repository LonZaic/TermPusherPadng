import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ImageOCRDialogProps {
  open: boolean;
  imageDataUrl: string | null;
  onClose: () => void;
  onInsert: (text: string) => void;
}

function ImageOCRDialog({ open, imageDataUrl: initialImage, onClose, onInsert }: ImageOCRDialogProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState('');
  const processingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  }, []);

  const doOCR = useCallback(async (dataUrl: string, source: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setImageDataUrl(dataUrl);
    setProcessing(true);
    setProcessingMsg('正在识别（首次需下载语言包约31MB，请耐心等待）...');
    setError('');
    setRecognizedText('');
    showToast(source);
    try {
      const text = await window.electronAPI.ocrRecognize(dataUrl);
      setRecognizedText(text);
      showToast('识别完成');
    } catch (err: any) {
      console.error('[OCR] error:', err);
      const msg = err?.message || err?.toString?.() || JSON.stringify(err) || '未知错误';
      setError('识别失败: ' + msg);
    } finally {
      setProcessing(false);
      setProcessingMsg('');
      processingRef.current = false;
    }
  }, [showToast]);

  useEffect(() => {
    if (open && initialImage) {
      doOCR(initialImage, '图片已载入，正在识别...');
    }
  }, [open, initialImage, doOCR]);

  useEffect(() => {
    if (!open) {
      setImageDataUrl(null);
      setRecognizedText('');
      setError('');
      setDragOver(false);
      setToast('');
      setProcessingMsg('');
    }
  }, [open]);

  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          fileToDataUrl(blob).then((dataUrl) => {
            doOCR(dataUrl, '图片粘贴成功，正在识别...');
          });
        }
        return;
      }
    }
  }, [fileToDataUrl, doOCR]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      fileToDataUrl(file).then((dataUrl) => {
        doOCR(dataUrl, '图片已拖入，正在识别...');
      });
    }
  }, [fileToDataUrl, doOCR]);

  const handleSelectFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        fileToDataUrl(file).then((dataUrl) => {
          doOCR(dataUrl, '图片已选择，正在识别...');
        });
      }
    };
    input.click();
  }, [fileToDataUrl, doOCR]);

  const handleInsert = useCallback(() => {
    const text = recognizedText.trim();
    if (text) {
      onInsert(text);
      onClose();
    }
  }, [recognizedText, onInsert, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleInsert();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleInsert, onClose]);

  if (!open) return null;

  return (
    <div className="ocr-overlay" onClick={onClose}>
      <div className="ocr-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="ocr-header">
          <span className="ocr-title">识图</span>
          <span className="ocr-hint">仅识别图片中的文字内容，不支持图片内容理解</span>
          <button className="ocr-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="ocr-body">
          <div className="ocr-image-panel">
            <div className="ocr-image-label">图片</div>
            <div
              className={`ocr-paste-zone ${dragOver ? 'drag-over' : ''} ${imageDataUrl ? 'has-image' : ''}`}
              onClick={handleSelectFile}
              onPaste={handlePaste}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              tabIndex={0}
            >
              {imageDataUrl ? (
                <img src={imageDataUrl} alt="截图预览" className="ocr-preview-image" />
              ) : (
                <div className="ocr-paste-hint">
                  <div className="ocr-paste-icon">+</div>
                  <div>点击此处选择图片文件</div>
                  <div className="ocr-paste-sub">或 Ctrl+V 粘贴剪贴板截图</div>
                  <div className="ocr-paste-sub">或拖拽图片到此处</div>
                </div>
              )}
            </div>
            {imageDataUrl && (
              <button className="ocr-change-btn" onClick={handleSelectFile}>
                重新选择图片
              </button>
            )}
          </div>
          <div className="ocr-text-panel">
            <div className="ocr-text-label">识别文本（仅文字，可编辑修改）:</div>
            {processing ? (
              <div className="ocr-processing">{processingMsg || '正在识别文字...'}</div>
            ) : error ? (
              <div className="ocr-error">{error}</div>
            ) : (
              <textarea
                ref={textareaRef}
                className="ocr-textarea"
                value={recognizedText}
                onChange={(e) => setRecognizedText(e.target.value)}
                placeholder={imageDataUrl ? '等待识别结果...' : '识别后的文字将显示在这里'}
              />
            )}
          </div>
        </div>
        <div className="ocr-footer">
          <span className="ocr-footer-hint">Ctrl+Enter 插入到终端输入框</span>
          <button className="ocr-insert-btn" onClick={handleInsert} disabled={processing || !recognizedText.trim()}>
            插入
          </button>
        </div>
        {toast && <div className="ocr-toast">{toast}</div>}
      </div>
    </div>
  );
}

export default ImageOCRDialog;
