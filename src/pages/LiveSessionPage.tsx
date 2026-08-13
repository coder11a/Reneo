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
import { SessionProducts } from '../components/live/SessionProducts';
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
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  // On phones, make the full live catalog visible immediately; chat remains
  // one tap away and desktop continues to show both panels side-by-side.
  const [activeTab, setActiveTab] = useState<'chat' | 'product'>('product');
  const [viewerCount, setViewerCount] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(false);
  const [sessionProducts, setSessionProducts] = useState<Product[]>([]);
  const [featuredId, setFeaturedId] = useState<string | null>(null);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef(false);
  const heartbeatRef = useRef<number | null>(null);
  const leavePromiseRef = useRef<Promise<void> | null>(null);
  const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null);

  const fetchSessionProducts = useCallback(async () => {
    if (!sessionId) return;
    const { data, error: productsError } = await supabase
      .from('live_session_products')
      .select('product:products(*)')
      .eq('session_id', sessionId)
      .order('added_at', { ascending: true });
    if (productsError) {
      console.error('Failed to load session products:', productsError);
      return;
    }
    setSessionProducts(((data as unknown as { product: Product }[]) || []).map(r => r.product).filter(Boolean));
  }, [sessionId]);

  const addProduct = async (productId: string) => {
    if (!sessionId) return;
    const { error: addError } = await supabase
      .from('live_session_products')
      .upsert({ session_id: sessionId, product_id: productId });

    if (addError) {
      console.error('Failed to add product to session:', addError);
      toast.error(`Could not add this product to the live session: ${addError.message}`);
      return;
    }

    await fetchSessionProducts();
    toast.success('Product added to this live session.');
  };

  const removeProduct = async (productId: string) => {
    if (productId === featuredId) {
      toast.error('Feature another product before removing this one.');
      return;
    }
    await supabase.from('live_session_products').delete().eq('session_id', sessionId).eq('product_id', productId);
    fetchSessionProducts();
  };

  const setFeatured = async (productId: string) => {
    await supabase.from('live_sessions').update({ product_id: productId }).eq('id', sessionId);
    setFeaturedId(productId);
  };

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
          .select('*, product:products!live_sessions_product_id_fkey(*), host:profiles(*)')
          .eq('id', sessionId)
          .single();

        if (sessionError || !data) {
          throw new Error('Session not found. It may have been deleted or the link is invalid.');
        }

        const sessionData = data as SessionWithDetails;
        setSession(sessionData);
        setFeaturedId(sessionData.product_id);
        fetchSessionProducts();

        if (sessionData.status === 'ended') {
          setStreamEnded(true);
          setLoading(false);
          return;
        }

        const hostStatus = user?.id === sessionData.host_id;
        setIsHost(hostStatus);

        // A live session should be discoverable as soon as its host opens it,
        // even if camera or microphone setup is delayed or denied.
        if (hostStatus) {
          const beat = async () => {
            const { error: heartbeatError } = await supabase
              .from('live_sessions')
              .update({ last_seen_at: new Date().toISOString() })
              .eq('id', sessionId);
            if (heartbeatError) console.error('Failed to update live heartbeat:', heartbeatError);
          };
          void beat();
          heartbeatRef.current = window.setInterval(() => void beat(), 10000);
        }

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
        setFeaturedId(newData.product_id); // host switched featured product
        if (newData.status === 'ended') {
          setStreamEnded(true);
          leaveChannel();
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_session_products',
        filter: `session_id=eq.${sessionId}`
      }, () => {
        fetchSessionProducts(); // product added/removed by host
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      leavePromiseRef.current = leaveChannel();
    };
  }, [sessionId, user?.id, authLoading]);

  // Realtime is the fastest way to receive product changes. Polling is kept as
  // a fallback so viewers still see products added after they joined when their
  // Supabase project has not enabled the realtime publication yet.
  useEffect(() => {
    if (!sessionId) return;
    const interval = window.setInterval(() => void fetchSessionProducts(), 5000);
    return () => clearInterval(interval);
  }, [sessionId, fetchSessionProducts]);

  // Play the host's local camera into the container once it's actually rendered
  // (during setup the loading screen is up, so the container ref is still null).
  useEffect(() => {
    const track = localVideoTrackRef.current;
    const container = videoContainerRef.current;
    if (!loading && hasLocalVideo && track && container) {
      track.play(container);
      return () => track.stop(); // remove the video element before any replay (StrictMode/remount) — avoids duplicate tiles
    }
  }, [loading, hasLocalVideo]);

  const setupAgora = async (channelName: string, isUserHost: boolean) => {
    try {
      const { token, appId } = await fetchToken(channelName, isUserHost ? 'host' : 'audience');

      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      clientRef.current = client;

      // Handle remote user publishing (audience sees the host)
      client.on('user-published', async (remoteUser, mediaType) => {
        // Host only ever shows their own local camera. Any remote publisher is a
        // stale/duplicate connection — ignore it so the host doesn't see themselves twice.
        if (isUserHost) return;
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === 'video' && videoContainerRef.current) {
          const remoteVideoTrack = remoteUser.videoTrack as IRemoteVideoTrack;
          // Only show one remote feed — stop any prior one so stale hosts don't stack.
          remoteVideoTrackRef.current?.stop();
          remoteVideoTrackRef.current = remoteVideoTrack;
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
        if (isUserHost) setViewerCount(client.remoteUsers.length);
      });
      client.on('user-left', () => {
        if (isUserHost) setViewerCount(client.remoteUsers.length);
      });

      // Set role BEFORE joining
      await client.setClientRole(isUserHost ? 'host' : 'audience');
      // uid null → Agora assigns a fresh unique uid (wildcard token), so a
      // rejoin never collides with a lingering connection (UID_CONFLICT).
      await client.join(appId, channelName, token, null);
      // Covers viewers who were already in the channel before the host joined.
      if (isUserHost) setViewerCount(client.remoteUsers.length);

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
          setHasLocalVideo(true); // play it from an effect once the container is mounted
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

  const handleLeaveLive = async () => {
    await leaveChannel();
    navigate('/');
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

  const featured = sessionProducts.find(p => p.id === featuredId) || session?.product || null;

  const handleAddToCart = (product?: Product) => {
    const p = product ?? featured;
    if (p) addItem(p);
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

        {!isHost && (
          <div className="live-overlay-bottom audience-controls">
            <button
              onClick={handleLeaveLive}
              className="host-control-btn end-live"
              title="Leave live session"
            >
              <PhoneOff size={18} />
              Leave Live
            </button>
          </div>
        )}

        {/* Featured product overlay for audience (desktop only — mobile uses sidebar) */}
        {!isHost && featured && (
          <div className="product-overlay">
            {featured.image_url ? (
              <img
                src={featured.image_url}
                alt={featured.name}
                className="product-overlay-image"
              />
            ) : (
              <div className="product-overlay-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
                No image
              </div>
            )}
            <div className="product-overlay-info">
              <div className="product-overlay-name">{featured.name}</div>
              <div className="product-overlay-price">${Number(featured.price).toFixed(2)}</div>
              <div className="product-overlay-stock">
                {featured.stock > 0 ? `${featured.stock} in stock` : 'Out of stock'}
              </div>
            </div>
            <div className="product-overlay-actions">
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => { setDetailProduct(featured); setShowProductDetail(true); }}
              >
                <Eye size={14} />
                View
              </button>
              <button
                className="btn btn-sm btn-success"
                onClick={() => handleAddToCart()}
                disabled={featured.stock <= 0}
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

        {/* Products panel: host manages the set, audience browses. Always visible
            on desktop; on mobile shown when the Product tab is active. */}
        <div
          className="sidebar-products"
          style={{
            display: activeTab === 'product' ? 'flex' : 'none',
            flexDirection: 'column',
            minHeight: 0,
            borderTop: '1px solid var(--color-border-light)',
            background: 'var(--color-bg-subtle)',
          }}
        >
          <SessionProducts
            isHost={isHost}
            hostId={session.host_id}
            products={sessionProducts}
            featuredId={featuredId}
            onFeature={setFeatured}
            onRemove={removeProduct}
            onAdd={addProduct}
            onView={(p) => { setDetailProduct(p); setShowProductDetail(true); }}
            onAddToCart={(p) => handleAddToCart(p)}
          />
        </div>
      </div>

      {/* Product detail slide-over */}
      {showProductDetail && detailProduct && (
        <ProductDetailPanel
          product={detailProduct}
          onClose={() => setShowProductDetail(false)}
          onAddToCart={() => {
            handleAddToCart(detailProduct);
            setShowProductDetail(false);
          }}
        />
      )}
    </div>
  );
}
