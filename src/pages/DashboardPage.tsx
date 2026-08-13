import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Package, Radio, Users, Plus, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { Product, LiveSession, Profile } from '../types';
import { goLive, LIVE_FRESHNESS_MS } from '../lib/live';

type LiveSessionWithDetails = LiveSession & {
  product: Product;
  host: Profile;
  sessionProducts: { product: Product | null }[];
};

export default function DashboardPage() {
  const { profile } = useAuth();

  if (!profile) return null;

  return profile.role === 'seller' ? <SellerDashboard /> : <CustomerDashboard />;
}

function SellerDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ products: 0, liveSessions: 0 });
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [
          { count: productsCount },
          { count: sessionsCount },
          { data: recentData },
        ] = await Promise.all([
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('seller_id', user.id),
          supabase.from('live_sessions').select('*', { count: 'exact', head: true }).eq('host_id', user.id).eq('status', 'live').gt('last_seen_at', new Date(Date.now() - LIVE_FRESHNESS_MS).toISOString()),
          supabase.from('products').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(3),
        ]);

        setStats({
          products: productsCount || 0,
          liveSessions: sessionsCount || 0,
        });
        setRecentProducts((recentData as Product[]) || []);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Failed to load dashboard: ' + msg);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Welcome, {profile?.name}!</h1>
            <p className="page-subtitle">Here's your seller overview</p>
          </div>
          <Link to="/products/new" className="btn btn-primary">
            <Plus size={18} />
            Add Product
          </Link>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
          <div className="card card-body" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={24} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)' }}>{stats.products}</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Products</div>
            </div>
          </div>
          <div className="card card-body" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'hsl(0, 85%, 95%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Radio size={24} style={{ color: 'var(--color-live)' }} />
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)' }}>{stats.liveSessions}</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Live Now</div>
            </div>
          </div>
        </div>

        {/* Recent products */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)' }}>Recent Products</h2>
          <Link to="/products" className="btn btn-secondary btn-sm">View All</Link>
        </div>

        {recentProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Package size={48} /></div>
            <h3 className="empty-state-title">No products yet</h3>
            <p className="empty-state-desc">Add your first product to start selling live!</p>
            <Link to="/products/new" className="btn btn-primary">
              <Plus size={18} /> Add Product
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {recentProducts.map(product => (
              <div key={product.id} className="card">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="card-image" />
                ) : (
                  <div className="card-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>
                    No image
                  </div>
                )}
                <div className="card-body">
                  <h3 style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)' }}>{product.name}</h3>
                  <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>
                    ${Number(product.price).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
                    {product.stock} in stock · <span className={`badge badge-${product.status === 'active' ? 'success' : 'neutral'}`}>{product.status}</span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', marginTop: 'var(--space-3)' }}
                    onClick={() => user && goLive(product, user.id, navigate)}
                    disabled={product.status !== 'active'}
                  >
                    <Radio size={14} /> Go Live
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerDashboard() {
  const { profile } = useAuth();
  const [liveSessions, setLiveSessions] = useState<LiveSessionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('live_sessions')
        .select('*, product:products!live_sessions_product_id_fkey(*), host:profiles(*), sessionProducts:live_session_products(product:products(*))')
        .eq('status', 'live');

      if (error) throw error;
      setLiveSessions((data as LiveSessionWithDetails[]) || []);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to load live sessions: ' + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    const liveChannel = supabase
      .channel('customer-live-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, fetchSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_session_products' }, fetchSessions)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(liveChannel);
    };
  }, [fetchSessions]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  // A seller has one live session, but that session can contain many products.
  // Expand it here so customers can browse every product as its own card while
  // all cards still take them to the same stream.
  const liveProducts = liveSessions.flatMap(session => {
    const products = session.sessionProducts
      ?.map(item => item.product)
      .filter((product): product is Product => Boolean(product)) ?? [];
    const productsToShow = products.length > 0 ? products : (session.product ? [session.product] : []);
    return productsToShow.map(product => ({ session, product }));
  });

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Welcome, {profile?.name}!</h1>
            <p className="page-subtitle">Discover live shopping sessions</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
          <span className="badge badge-live">
            <span className="live-dot" />
            LIVE NOW
          </span>
        </div>

        {liveProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Users size={48} /></div>
            <h3 className="empty-state-title">No live sessions right now</h3>
            <p className="empty-state-desc">Check back later for exciting live shopping events!</p>
          </div>
        ) : (
          <div className="product-grid">
            {liveProducts.map(({ session, product }) => (
              <div key={`${session.id}-${product.id}`} className="card">
                <div style={{ position: 'relative' }}>
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="card-image" />
                  ) : (
                    <div className="card-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>
                      No image
                    </div>
                  )}
                  <span className="badge badge-live" style={{ position: 'absolute', top: 'var(--space-3)', left: 'var(--space-3)' }}>
                    <span className="live-dot" />
                    LIVE
                  </span>
                </div>
                <div className="card-body">
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {session.host?.name || 'Unknown host'}
                  </div>
                  <h3 style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)' }}>
                    {product.name}
                  </h3>
                  <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)', marginBottom: 'var(--space-4)' }}>
                    ${Number(product.price).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: product.stock > 0 ? 'var(--color-success)' : 'var(--color-danger)', marginTop: 'calc(var(--space-2) * -1)', marginBottom: 'var(--space-4)' }}>
                    {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                  </div>
                  <Link to={`/live/${session.id}`} className="btn btn-primary" style={{ width: '100%' }}>
                    <Eye size={16} />
                    Join Live
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
