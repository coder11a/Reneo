import React from 'react';
import { useNavigate } from 'react-router-dom';
import { VideoOff } from 'lucide-react';

interface StreamEndedProps {
  hostName: string;
}

export function StreamEnded({ hostName }: StreamEndedProps) {
  const navigate = useNavigate();

  return (
    <div className="live-layout">
      <div className="live-video-area">
        <div className="stream-ended">
          <VideoOff size={56} style={{ opacity: 0.5 }} />
          <h2 className="stream-ended-title">Stream has ended</h2>
          <p className="stream-ended-desc">
            {hostName}&apos;s live session has ended. Thanks for watching!
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
