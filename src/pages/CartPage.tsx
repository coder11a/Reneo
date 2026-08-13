import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from 'lucide-react';

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalPrice } = useCart();

  if (items.length === 0) {
    return (
      <div className="page">
        <div className="container">
          <div className="empty-state">
            <div className="empty-state-icon"><ShoppingBag size={56} /></div>
            <h3 className="empty-state-title">Your cart is empty</h3>
            <p className="empty-state-desc">
              Join a live session to discover products and add them to your cart!
            </p>
            <Link to="/" className="btn btn-primary">
              <ArrowLeft size={18} />
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container cart-page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Shopping Cart</h1>
            <p className="page-subtitle">{items.length} item{items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          {items.map((item, index) => (
            <div
              key={item.product.id}
              className="cart-item"
              style={index === items.length - 1 ? { borderBottom: 'none' } : undefined}
            >
              {item.product.image_url ? (
                <img
                  src={item.product.image_url}
                  alt={item.product.name}
                  className="cart-item-image"
                />
              ) : (
                <div
                  className="cart-item-image"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  No img
                </div>
              )}

              <div className="cart-item-info">
                <div className="cart-item-name">{item.product.name}</div>
                <div className="cart-item-price">${Number(item.product.price).toFixed(2)}</div>
              </div>

              <div className="cart-quantity">
                <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                  <Minus size={14} />
                </button>
                <span>{item.quantity}</span>
                <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                  <Plus size={14} />
                </button>
              </div>

              <div className="cart-item-subtotal">
                ${(Number(item.product.price) * item.quantity).toFixed(2)}
              </div>

              <button
                onClick={() => removeItem(item.product.id)}
                className="btn btn-icon btn-ghost"
                style={{ color: 'var(--color-danger)' }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          <div className="cart-total">
            <span className="cart-total-label">Total</span>
            <span className="cart-total-amount">${totalPrice.toFixed(2)}</span>
          </div>
        </div>

        <div className="cart-actions">
          <Link to="/" className="btn btn-secondary">
            <ArrowLeft size={18} />
            Continue Shopping
          </Link>
          <button className="btn btn-primary btn-lg">
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
