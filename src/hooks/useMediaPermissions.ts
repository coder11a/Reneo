import { useState } from 'react';

export function useMediaPermissions() {
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const checkCameraPermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionError(null);
      return true;
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionError('Camera access denied. Please allow camera in your browser settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermissionError('Camera not found. Please connect a camera and try again.');
      } else {
        setPermissionError('Could not access media devices. Please check permissions and try again.');
      }
      return false;
    }
  };

  const checkMicPermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionError(null);
      return true;
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionError('Microphone access denied. Please allow microphone in your browser settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermissionError('Microphone not found. Please connect a microphone and try again.');
      } else {
        setPermissionError('Could not access media devices. Please check permissions and try again.');
      }
      return false;
    }
  };

  const requestPermissions = async (): Promise<{ camera: boolean; mic: boolean }> => {
    let camera = false;
    let mic = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop());
      camera = true;
      mic = true;
      setPermissionError(null);
    } catch (error: any) {
      camera = await checkCameraPermission();
      mic = await checkMicPermission();
    }

    return { camera, mic };
  };

  return {
    checkCameraPermission,
    checkMicPermission,
    requestPermissions,
    permissionError
  };
}
