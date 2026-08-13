import React from 'react';
import { X, ShoppingCart } from 'lucide-react';
import { Product } from '../../types';

interface ProductDetailPanelProps {
  product: Product;
  onClose: () => void;
  onAddToCart: () => void;
}

export function ProductDetailPanel({ product, onClose, onAddToCart }: ProductDetailPanelProps) {
  return (
    <>
      <div
        className="product-detail-overlay"
        onClick={onClose}
      />
      <div className="product-detail-panel">
        <button onClick={onClose} className="product-detail-close btn btn-icon btn-ghost">
          <X size={20} />
        </button>

        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="product-detail-image"
          />
        ) : (
          <div className="product-detail-image" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-tertiary)',
          }}>
            No Image
          </div>
        )}

        <div className="product-detail-content">
          <h2 className="product-detail-name">{product.name}</h2>
          <div className="product-detail-price">${Number(product.price).toFixed(2)}</div>
          <div className="product-detail-stock">
            <span className={`badge ${product.stock > 0 ? 'badge-success' : 'badge-warning'}`}>
              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            </span>
          </div>
          {product.description && (
            <p className="product-detail-desc">{product.description}</p>
          )}

          <button
            onClick={onAddToCart}
            disabled={product.stock <= 0}
            className={`btn btn-lg ${product.stock > 0 ? 'btn-success' : 'btn-secondary'}`}
            style={{ width: '100%' }}
          >
            <ShoppingCart size={20} />
            {product.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
          </button>
        </div>
      </div>
    </>
  );
}
