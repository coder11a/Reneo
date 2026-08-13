import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Radio, Edit, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { Product } from '../types';
import { goLive } from '../lib/live';

export default function ProductsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProducts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts((data as Product[]) || []);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to load products: ' + msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      toast.success('Product deleted');
      setProducts(products.filter(p => p.id !== id));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to delete product: ' + msg);
    }
  };

  const handleGoLive = (product: Product) => {
    if (!user) return;
    goLive(product, user.id, navigate);
  };

  if (isLoading) {
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
            <h1 className="page-title">My Products</h1>
            <p className="page-subtitle">{products.length} product{products.length !== 1 ? 's' : ''}</p>
          </div>
          <Link to="/products/new" className="btn btn-primary">
            <Plus size={18} />
            Add Product
          </Link>
        </div>

        {products.length === 0 ? (
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
            {products.map(product => (
              <div key={product.id} className="card">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="card-image" />
                ) : (
                  <div className="card-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>
                    <Package size={32} />
                  </div>
                )}
                <div className="card-body">
                  <h3 style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)' }}>
                    {product.name}
                  </h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>
                      ${Number(product.price).toFixed(2)}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      {product.stock} in stock
                    </span>
                  </div>
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <span className={`badge badge-${product.status === 'active' ? 'success' : product.status === 'draft' ? 'neutral' : 'warning'}`}>
                      {product.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      onClick={() => handleGoLive(product)}
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                    >
                      <Radio size={14} /> Go Live
                    </button>
                    <Link
                      to={`/products/${product.id}/edit`}
                      className="btn btn-secondary btn-sm btn-icon"
                    >
                      <Edit size={14} />
                    </Link>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="btn btn-ghost btn-sm btn-icon"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
