import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AgoraRTC, {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteVideoTrack,
  IRemoteAudioTrack,
} from 'agora-rtc-react';
import {
  Maximize,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Users,
  ShoppingBag,
  Eye,
  VideoOffIcon,
  AlertCircle,
  SwitchCamera,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useAgoraToken } from '../hooks/useAgoraToken';
import { ChatPanel } from '../components/live/ChatPanel';
import { ProductDetailPanel } from '../components/live/ProductDetailPanel';
import { StreamEnded } from '../components/live/StreamEnded';
import { LiveSession, Product, Profile } from '../types';

type SessionWithDetails = LiveSession & {
  product: Product;
  host: Profile;
};

export default function LiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const { addItem } = useCart();
  const { fetchToken } = useAgoraToken();

  const [session, setSession] = useState<SessionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isHost, setIsHost] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);

  const [micMuted, setMicMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'product'>('chat');
  const [viewerCount, setViewerCount] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef(false);
  const heartbeatRef = useRef<number | null>(null);
  const leavePromiseRef = useRef<Promise<void> | null>(null);

  const leaveChannel = useCallback(async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.close();
      localAudioTrackRef.current = null;
    }
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.close();
      localVideoTrackRef.current = null;
    }
    if (clientRef.current) {
      try {
        await clientRef.current.unpublish();
      } catch (e) {
        // May fail if not published — that's OK
      }
      try {
        await clientRef.current.leave();
      } catch (e) {
        console.error('Error leaving channel:', e);
      }
      clientRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (authLoading) return; // wait for auth to settle before connecting

    const initSession = async () => {
      try {
        const { data, error: sessionError } = await supabase
          .from('live_sessions')
          .select('*, product:products(*), host:profiles(*)')
          .eq('id', sessionId)
          .single();

        if (sessionError || !data) {
          throw new Error('Session not found. It may have been deleted or the link is invalid.');
        }

        const sessionData = data as SessionWithDetails;
        setSession(sessionData);

        if (sessionData.status === 'ended') {
          setStreamEnded(true);
          setLoading(false);
          return;
        }

        const hostStatus = user?.id === sessionData.host_id;
        setIsHost(hostStatus);

        // Wait for any prior teardown to finish so the same UID isn't joining
        // twice (StrictMode remount) — that triggers Agora UID_CONFLICT.
        if (leavePromiseRef.current) {
          await leavePromiseRef.current;
          leavePromiseRef.current = null;
        }

        cleanupRef.current = false;
        await setupAgora(sessionData.channel_name, hostStatus);
        setLoading(false);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error loading session';
        setError(message);
        setLoading(false);
      }
    };

    initSession();

    // Subscribe to session status changes (detect when stream ends)
    const sessionChannel = supabase.channel(`session:${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_sessions',
        filter: `id=eq.${sessionId}`
      }, (payload) => {
        const newData = payload.new as LiveSession;
        if (newData.status === 'ended') {
          setStreamEnded(true);
          leaveChannel();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      leavePromiseRef.current = leaveChannel();
    };
  }, [sessionId, user?.id, authLoading]);

  const setupAgora = async (channelName: string, isUserHost: boolean) => {
    try {
      const { token, appId } = await fetchToken(channelName, isUserHost ? 'host' : 'audience');

      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      clientRef.current = client;

      // Handle remote user publishing (audience sees the host)
      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === 'video' && videoContainerRef.current) {
          const remoteVideoTrack = remoteUser.videoTrack as IRemoteVideoTrack;
          remoteVideoTrack.play(videoContainerRef.current);
          setHasRemoteVideo(true);
        }
        if (mediaType === 'audio') {
          const remoteAudioTrack = remoteUser.audioTrack as IRemoteAudioTrack;
          remoteAudioTrack.play();
        }
      });

      client.on('user-unpublished', (remoteUser, mediaType) => {
        if (mediaType === 'video') {
          remoteUser.videoTrack?.stop();
          setHasRemoteVideo(false);
        }
      });

      // Token refresh
      client.on('token-privilege-will-expire', async () => {
        try {
          const { token: newToken } = await fetchToken(channelName, isUserHost ? 'host' : 'audience');
          await client.renewToken(newToken);
        } catch (e) {
          console.error('Failed to renew token', e);
          toast.error('Session token is expiring. Please refresh the page.');
        }
      });

      // Connection state monitoring
      client.on('connection-state-change', (curState, _revState, reason) => {
        if (cleanupRef.current) return; // intentional teardown — stay quiet
        if (curState === 'DISCONNECTED') {
          if (reason === 'LEAVE') return; // Normal leave
          console.warn('Agora disconnected:', reason);
        } else if (curState === 'RECONNECTING') {
          toast('Reconnecting...', { icon: '🔄' });
        } else if (curState === 'CONNECTED' && _revState === 'RECONNECTING') {
          toast.success('Reconnected!');
        }
      });

      // Viewer count tracking
      client.on('user-joined', () => {
        setViewerCount(prev => prev + 1);
      });
      client.on('user-left', () => {
        setViewerCount(prev => Math.max(0, prev - 1));
      });

      // Set role BEFORE joining
      await client.setClientRole(isUserHost ? 'host' : 'audience');
      // uid null → Agora assigns a fresh unique uid (wildcard token), so a
      // rejoin never collides with a lingering connection (UID_CONFLICT).
      await client.join(appId, channelName, token, null);

      // Host: create and publish local tracks
      if (isUserHost) {
        try {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          localAudioTrackRef.current = audioTrack;
        } catch (e) {
          toast.error('Microphone not found. Please connect a microphone and try again.');
          console.error('Mic error:', e);
        }

        try {
          const videoTrack = await AgoraRTC.createCameraVideoTrack();
          localVideoTrackRef.current = videoTrack;

          if (videoContainerRef.current) {
            videoTrack.play(videoContainerRef.current);
          }
        } catch (e) {
          toast.error('Camera access denied. Please allow camera in your browser settings.');
          console.error('Camera error:', e);
        }

        const tracksToPublish = [
          localAudioTrackRef.current,
          localVideoTrackRef.current,
        ].filter(Boolean) as (IMicrophoneAudioTrack | ICameraVideoTrack)[];

        if (tracksToPublish.length > 0) {
          await client.publish(tracksToPublish);
        }

        // Heartbeat: keep the session marked live only while the host is here.
        // Stops on leave/tab-close, so stale sessions drop off the customer feed.
        const beat = () =>
          supabase.from('live_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', sessionId);
        beat();
        heartbeatRef.current = window.setInterval(beat, 10000);
      }
      // Audience: do NOT create or publish any local tracks
    } catch (err: unknown) {
      console.error('Agora setup error:', err);
      if (cleanupRef.current) return; // aborted by teardown — not a real failure
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('PERMISSION_DENIED') || message.includes('NotAllowedError')) {
        toast.error('Camera/microphone access denied. Please allow access in browser settings.');
      }
      // Other connect failures are logged above, no toast.
    }
  };

  const handleEndStream = async () => {
    if (!sessionId) return;
    try {
      await leaveChannel();
      await supabase
        .from('live_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
      setStreamEnded(true);
      toast.success('Stream ended successfully');
    } catch (e) {
      console.error(e);
      toast.error('Failed to end stream. Please try again.');
    }
  };

  const toggleMic = async () => {
    if (localAudioTrackRef.current) {
      const newMutedState = !micMuted;
      await localAudioTrackRef.current.setEnabled(!newMutedState);
      setMicMuted(newMutedState);
    } else {
      toast.error('Microphone not available.');
    }
  };

  const toggleVideo = async () => {
    if (localVideoTrackRef.current) {
      const newMutedState = !videoMuted;
      await localVideoTrackRef.current.setEnabled(!newMutedState);
      setVideoMuted(newMutedState);
    } else {
      toast.error('Camera not available.');
    }
  };

  const switchCamera = async () => {
    if (localVideoTrackRef.current) {
      try {
        const devices = await AgoraRTC.getCameras();
        if (devices.length < 2) {
          toast('Only one camera detected.');
          return;
        }
        await (localVideoTrackRef.current as any).setDevice(
          devices.find(d => d.deviceId !== (localVideoTrackRef.current as any)._deviceName)?.deviceId || devices[1].deviceId
        );
      } catch (e) {
        toast.error('Failed to switch camera.');
      }
    }
  };

  const toggleFullscreen = () => {
    if (videoContainerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoContainerRef.current.requestFullscreen().catch(() => {
          toast.error('Fullscreen not supported in this browser.');
        });
      }
    }
  };

  const handleAddToCart = () => {
    if (session?.product) {
      addItem(session.product);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <p className="loading-screen-text">Connecting to live session...</p>
      </div>
    );
  }

  // Error state
  if (error || !session) {
    return (
      <div className="error-page">
        <AlertCircle size={48} style={{ color: 'var(--color-danger)' }} />
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' }}>
          {error || 'Session not found'}
        </h2>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    );
  }

  // Stream ended state
  if (streamEnded) {
    return <StreamEnded hostName={session.host.name} />;
  }

  return (
    <div className="live-layout">
      {/* Video area */}
      <div className="live-video-area" ref={videoContainerRef}>
        {/* Show placeholder when no video */}
        {!isHost && !hasRemoteVideo && (
          <div className="no-video-placeholder">
            <VideoOffIcon size={48} />
            <p>Waiting for host to start streaming...</p>
          </div>
        )}

        {/* Top overlay: live badge, host info, viewer count */}
        <div className="live-overlay-top">
          <div className="live-info">
            <span className="badge badge-live">
              <span className="live-dot" />
              LIVE
            </span>
            <span className="live-host-name">{session.host.name}</span>
          </div>
          <div className="live-viewer-count">
            <Users size={14} />
            {viewerCount}
          </div>
        </div>

        {/* Bottom overlay: host controls */}
        {isHost && (
          <div className="live-overlay-bottom">
            <div className="host-controls">
              <button
                onClick={toggleMic}
                className={`host-control-btn ${micMuted ? 'active' : ''}`}
                title={micMuted ? 'Unmute' : 'Mute'}
              >
                {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button
                onClick={toggleVideo}
                className={`host-control-btn ${videoMuted ? 'active' : ''}`}
                title={videoMuted ? 'Turn on camera' : 'Turn off camera'}
              >
                {videoMuted ? <VideoOff size={20} /> : <Video size={20} />}
              </button>
              <button
                onClick={switchCamera}
                className="host-control-btn"
                title="Switch camera"
              >
                <SwitchCamera size={20} />
              </button>
              <button
                onClick={toggleFullscreen}
                className="host-control-btn"
                title="Fullscreen"
              >
                <Maximize size={20} />
              </button>
              <button
                onClick={handleEndStream}
                className="host-control-btn end-live"
                title="End live"
              >
                <PhoneOff size={18} />
                End
              </button>
            </div>
          </div>
        )}

        {/* Product overlay for audience (desktop only — mobile uses sidebar) */}
        {!isHost && (
          <div className="product-overlay">
            {session.product.image_url ? (
              <img
                src={session.product.image_url}
                alt={session.product.name}
                className="product-overlay-image"
              />
            ) : (
              <div className="product-overlay-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
                No image
              </div>
            )}
            <div className="product-overlay-info">
              <div className="product-overlay-name">{session.product.name}</div>
              <div className="product-overlay-price">${Number(session.product.price).toFixed(2)}</div>
              <div className="product-overlay-stock">
                {session.product.stock > 0 ? `${session.product.stock} in stock` : 'Out of stock'}
              </div>
            </div>
            <div className="product-overlay-actions">
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setShowProductDetail(true)}
              >
                <Eye size={14} />
                View
              </button>
              <button
                className="btn btn-sm btn-success"
                onClick={handleAddToCart}
                disabled={session.product.stock <= 0}
              >
                <ShoppingBag size={14} />
                Buy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar: chat + product (mobile tabs) */}
      <div className="live-sidebar">
        {/* Mobile tabs */}
        <div className="live-mobile-tabs">
          <button
            className={`live-mobile-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={`live-mobile-tab ${activeTab === 'product' ? 'active' : ''}`}
            onClick={() => setActiveTab('product')}
          >
            Product
          </button>
        </div>

        {/* Chat panel (visible on desktop always, on mobile only when chat tab active) */}
        <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}
          className="desktop-always-show"
        >
          <ChatPanel sessionId={session.id} />
        </div>

        {/* Product info section (mobile only when product tab active, desktop: shown below chat) */}
        <div
          style={{
            display: activeTab === 'product' ? 'flex' : 'none',
            flexDirection: 'column',
            padding: 'var(--space-4)',
            borderTop: '1px solid var(--color-border-light)',
            background: 'var(--color-bg-subtle)',
          }}
          className="desktop-hide-product"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            {session.product.image_url ? (
              <img
                src={session.product.image_url}
                alt={session.product.name}
                style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
                No img
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)' }}>
                {session.product.name}
              </div>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>
                ${Number(session.product.price).toFixed(2)}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                {session.product.stock > 0 ? `${session.product.stock} in stock` : 'Out of stock'}
              </div>
            </div>
          </div>
          {session.product.description && (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 'var(--line-height-relaxed)', marginBottom: 'var(--space-4)' }}>
              {session.product.description}
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowProductDetail(true)}>
              Full Details
            </button>
            <button
              className="btn btn-success"
              style={{ flex: 1 }}
              onClick={handleAddToCart}
              disabled={session.product.stock <= 0}
            >
              <ShoppingBag size={16} />
              Add to Cart
            </button>
          </div>
        </div>
      </div>

      {/* Product detail slide-over */}
      {showProductDetail && (
        <ProductDetailPanel
          product={session.product}
          onClose={() => setShowProductDetail(false)}
          onAddToCart={() => {
            handleAddToCart();
            setShowProductDetail(false);
          }}
        />
      )}
    </div>
  );
}
