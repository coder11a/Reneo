import { useEffect, useState } from 'react';
import { Star, Trash2, Plus, Eye, ShoppingBag } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Product } from '../../types';

interface Props {
  isHost: boolean;
  hostId: string;
  products: Product[];           // products currently in the session
  featuredId: string | null;
  onFeature: (productId: string) => void;
  onRemove: (productId: string) => void;
  onAdd: (productId: string) => void;
  onView: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export function SessionProducts({
  isHost, hostId, products, featuredId, onFeature, onRemove, onAdd, onView, onAddToCart,
}: Props) {
  const [catalog, setCatalog] = useState<Product[]>([]);

  // Host's own active products, for the "add to session" picker.
  useEffect(() => {
    if (!isHost) return;
    supabase
      .from('products')
      .select('*')
      .eq('seller_id', hostId)
      .eq('status', 'active')
      .then(({ data }) => setCatalog((data as Product[]) || []));
  }, [isHost, hostId]);

  const inSession = new Set(products.map(p => p.id));
  const addable = catalog.filter(p => !inSession.has(p.id));

  return (
    <div className={`session-products ${isHost ? 'session-products-host' : 'session-products-customer'}`}>
      <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' }}>
        Products in this session
      </div>

      {products.map(product => (
        <div key={product.id} className="card card-body session-product-row">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)' }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {product.name}
              {product.id === featuredId && (
                <span className="badge badge-live"><Star size={10} /> Featured</span>
              )}
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>
              ${Number(product.price).toFixed(2)}
            </div>
          </div>

          {isHost ? (
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {product.id !== featuredId && (
                <button className="btn btn-sm btn-secondary" title="Feature" onClick={() => onFeature(product.id)}>
                  <Star size={14} />
                </button>
              )}
              <button className="btn btn-sm btn-danger" title="Remove" onClick={() => onRemove(product.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              <button className="btn btn-sm btn-secondary" onClick={() => onView(product)}>
                <Eye size={14} />
              </button>
              <button className="btn btn-sm btn-success" disabled={product.stock <= 0} onClick={() => onAddToCart(product)}>
                <ShoppingBag size={14} />
              </button>
            </div>
          )}
        </div>
      ))}

      {isHost && addable.length > 0 && (
        <>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', marginTop: 'var(--space-2)' }}>
            Add more
          </div>
          {addable.map(product => (
            <div key={product.id} className="card card-body" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)' }} />
              )}
              <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-sm)' }}>{product.name}</div>
              <button className="btn btn-sm btn-primary" onClick={() => onAdd(product.id)}>
                <Plus size={14} /> Add
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
