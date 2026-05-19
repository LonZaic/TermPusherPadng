import React, { useState } from 'react';

interface NewConversationDialogProps {
  open: boolean;
  currentProjectPath: string | null;
  currentProjectName: string;
  onClose: () => void;
  onConfirm: (projectPath: string | null, openInNewWindow: boolean) => void;
}

type Step = 'project' | 'window';

function NewConversationDialog({
  open,
  currentProjectPath,
  currentProjectName,
  onClose,
  onConfirm,
}: NewConversationDialogProps) {
  const [step, setStep] = useState<Step>('project');
  const [inheritProject, setInheritProject] = useState<boolean | null>(null);

  if (!open) return null;

  const handleClose = () => {
    setStep('project');
    setInheritProject(null);
    onClose();
  };

  const handleProjectChoice = (inherit: boolean) => {
    setInheritProject(inherit);
    setStep('window');
  };

  const handleWindowChoice = (newWindow: boolean) => {
    const projectPath = inheritProject ? currentProjectPath : null;
    onConfirm(projectPath, newWindow);
    setStep('project');
    setInheritProject(null);
  };

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog nc-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>新建对话</h3>
          <button className="dialog-close" onClick={handleClose}>✕</button>
        </div>

        <div className="dialog-body">
          {step === 'project' && (
            <div className="nc-step">
              <p className="nc-question">
                {currentProjectPath
                  ? `是否继承当前项目？`
                  : `当前无项目，将创建无项目对话`}
              </p>
              {currentProjectPath && (
                <p className="nc-hint">
                  当前项目：<strong>{currentProjectName}</strong>
                </p>
              )}
              <div className="nc-choices">
                {currentProjectPath ? (
                  <>
                    <button
                      className="btn nc-btn nc-btn-primary"
                      onClick={() => handleProjectChoice(true)}
                    >
                      继承项目
                    </button>
                    <button
                      className="btn nc-btn"
                      onClick={() => handleProjectChoice(false)}
                    >
                      无项目对话
                    </button>
                  </>
                ) : (
                  <button
                    className="btn nc-btn nc-btn-primary"
                    onClick={() => handleProjectChoice(false)}
                  >
                    创建无项目对话
                  </button>
                )}
              </div>
              <button className="btn nc-btn-back" onClick={handleClose}>
                取消
              </button>
            </div>
          )}

          {step === 'window' && (
            <div className="nc-step">
              <p className="nc-question">在哪个窗口打开？</p>
              <p className="nc-hint">
                {inheritProject
                  ? `将继承项目：${currentProjectName}`
                  : '将创建无项目会话'}
              </p>
              <div className="nc-choices">
                <button
                  className="btn nc-btn nc-btn-primary"
                  onClick={() => handleWindowChoice(false)}
                >
                  当前窗口（新标签）
                </button>
                <button
                  className="btn nc-btn"
                  onClick={() => handleWindowChoice(true)}
                >
                  新窗口
                </button>
              </div>
              <button
                className="btn nc-btn-back"
                onClick={() => setStep('project')}
              >
                ← 返回上一步
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NewConversationDialog;
