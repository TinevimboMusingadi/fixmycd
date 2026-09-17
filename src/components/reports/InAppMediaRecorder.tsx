'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface MediaRecorderProps {
  onRecordingComplete: (blob: Blob, type: 'photo' | 'video' | 'audio') => void;
  onCancel: () => void;
}

export function InAppMediaRecorder({ onRecordingComplete, onCancel }: MediaRecorderProps) {
  const [mode, setMode] = useState<'photo' | 'video' | 'audio' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const checkSupport = () => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  const startRecording = useCallback(async (type: 'photo' | 'video' | 'audio') => {
    setError(null);
    setMode(type);

    if (!checkSupport()) {
      setError('Your browser does not support in-app recording. Please use the file picker instead.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: type === 'audio' ? false : {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: type !== 'photo',
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      setHasPermission(true);

      if (videoRef.current && type !== 'audio') {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (type === 'photo') return;

      const mimeType = type === 'video'
        ? MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setPreview(URL.createObjectURL(blob));
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setHasPermission(false);
      setError(err instanceof Error ? err.message : 'Failed to access media devices. Please check your permissions.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
  }, [isRecording]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        setPreview(URL.createObjectURL(blob));
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
        }
      }
    }, 'image/jpeg');
  }, []);

  const confirm = useCallback(async () => {
    if (!preview) return;
    try {
      const response = await fetch(preview);
      const blob = await response.blob();
      onRecordingComplete(blob, mode as 'photo' | 'video' | 'audio');
      reset();
    } catch (err) {
      setError('Failed to process recording');
    }
  }, [preview, mode, onRecordingComplete]);

  const reset = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setMode(null);
    setIsRecording(false);
    setPreview(null);
    setError(null);
    chunksRef.current = [];
  }, [preview]);

  // Fallback if no media device support
  if (!checkSupport()) {
    return (
      <div className="media-recorder-fallback">
        <p>In-app recording is not supported on this browser. Please use the file picker instead.</p>
        <button 
          onClick={onCancel} 
          className="btn-secondary"
          style={{ color: '#333', background: '#f0f0f0', border: '1px solid #ccc', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="media-recorder">
      {error && (
        <div className="recorder-error" style={{
          background: '#fef2f2',
          color: '#dc2626',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '12px',
        }}>
          ⚠️ {error}
        </div>
      )}

      {!mode && (
        <div className="recorder-options" style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '20px',
        }}>
          <h4 style={{ margin: '0 0 8px 0' }}>Record Media</h4>
          <button onClick={() => startRecording('photo')} className="btn-primary">
            📸 Take Photo
          </button>
          <button onClick={() => startRecording('video')} className="btn-primary">
            🎥 Record Video
          </button>
          <button onClick={() => startRecording('audio')} className="btn-primary">
            🎙️ Record Audio
          </button>
          <button 
            onClick={onCancel} 
            className="btn-secondary" 
            style={{ marginTop: '8px', color: '#333', background: '#f0f0f0', border: '1px solid #ccc', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {mode && (
        <div className="recorder-preview" style={{ padding: '16px' }}>
          {!preview && (mode === 'photo' || mode === 'video') && (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', maxHeight: '300px', borderRadius: '8px', background: '#000' }}
            />
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {preview && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '200px',
              background: '#f0f0f0',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              {mode === 'photo' && <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px' }} />}
              {mode === 'video' && <video src={preview} controls style={{ maxWidth: '100%', maxHeight: '300px' }} />}
              {mode === 'audio' && <audio src={preview} controls />}
            </div>
          )}

          {/* Recording indicator */}
          {!preview && mode !== 'photo' && isRecording && (
            <div style={{
              textAlign: 'center',
              marginTop: '12px',
              color: '#dc2626',
              fontSize: '14px',
              fontWeight: 600,
            }}>
              ● Recording...
            </div>
          )}

          <div className="recorder-controls" style={{
            display: 'flex',
            gap: '8px',
            marginTop: '16px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}>
            {/* Photo: Capture button */}
            {!preview && mode === 'photo' && (
              <button 
                onClick={takePhoto} 
                className="btn-primary"
                style={{ background: '#8b5cf6', color: 'white', padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
              >
                📸 Capture
              </button>
            )}

            {/* Video/Audio: Stop button while recording */}
            {!preview && mode !== 'photo' && isRecording && (
              <button 
                onClick={stopRecording} 
                className="btn-danger"
                style={{ background: '#dc2626', color: 'white', padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
              >
                ⏹ Stop Recording
              </button>
            )}

            {/* Preview: Use/Retake */}
            {preview && (
              <>
                <button 
                  onClick={confirm} 
                  className="btn-primary"
                  style={{ background: '#8b5cf6', color: 'white', padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                >
                  ✅ Use This
                </button>
                <button 
                  onClick={reset} 
                  className="btn-secondary"
                  style={{ color: '#333', background: '#f0f0f0', border: '1px solid #ccc', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  🔄 Retake
                </button>
              </>
            )}

            {/* Cancel always available */}
            <button 
              onClick={() => { reset(); onCancel(); }} 
              className="btn-secondary"
              style={{ color: '#333', background: '#f0f0f0', border: '1px solid #ccc', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}