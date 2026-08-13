import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, LogOut, User, Radio, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';

export const Header: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="header">
      <Link to="/" className="header-logo">
        Reneo<span>Live</span>
      </Link>

      <nav className="header-nav">
        {profile?.role === 'seller' && (
          <>
            <Link to="/products" className="btn btn-ghost btn-sm">
              <Package size={18} />
              <span className="hide-mobile">My Products</span>
            </Link>
          </>
        )}

        {user && (
          <div className="header-user">
            <Link to="/cart" className="btn btn-icon btn-ghost" style={{ position: 'relative', overflow: 'visible' }}>
              <ShoppingCart size={20} />
              {totalItems > 0 && (
                <span className="cart-badge">{totalItems}</span>
              )}
            </Link>

            <div className="header-avatar">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : <User size={16} />}
            </div>

            <button
              onClick={handleSignOut}
              className="btn btn-icon btn-ghost"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </nav>
    </header>
  );
};
