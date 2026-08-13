import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Upload, Save, Image } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreateProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const isEditing = !!productId;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    stock: 0,
    status: 'draft' as 'draft' | 'active' | 'archived',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);

  useEffect(() => {
    if (isEditing && productId) {
      const fetchProduct = async () => {
        try {
          const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', productId)
            .single();
          if (error) throw error;
          if (data) {
            setFormData({
              name: data.name,
              description: data.description || '',
              price: data.price,
              stock: data.stock,
              status: data.status,
            });
            if (data.image_url) setImagePreview(data.image_url);
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Failed to load product: ' + msg);
          navigate('/products');
        } finally {
          setInitialLoading(false);
        }
      };
      fetchProduct();
    }
  }, [productId, isEditing, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'price' || name === 'stock' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.name.trim()) {
      return toast.error('Product name is required');
    }
    if (formData.price < 0) {
      return toast.error('Price cannot be negative');
    }
    if (formData.stock < 0) {
      return toast.error('Stock cannot be negative');
    }

    setIsLoading(true);
    try {
      let imageUrl = imagePreview;

      // Upload image if new file selected
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      const productData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: formData.price,
        stock: formData.stock,
        status: formData.status,
        image_url: imageUrl || null,
        seller_id: user.id,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productId);
        if (error) throw error;
        toast.success('Product updated!');
      } else {
        const { error } = await supabase
          .from('products')
          .insert(productData);
        if (error) throw error;
        toast.success('Product created!');
      }

      navigate('/products');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to save product: ' + msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 680 }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Link to="/products" className="btn btn-icon btn-ghost">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="page-title" style={{ margin: 0 }}>
              {isEditing ? 'Edit Product' : 'New Product'}
            </h1>
          </div>
        </div>

        <div className="card card-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

            {/* Image upload */}
            <div className="form-group">
              <label className="form-label">Product Image</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
                  />
                ) : (
                  <div style={{
                    width: 96, height: 96, borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-subtle)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-text-tertiary)',
                  }}>
                    <Image size={32} />
                  </div>
                )}
                <div>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={14} />
                    {imagePreview ? 'Change Image' : 'Upload Image'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <p className="form-hint" style={{ marginTop: 'var(--space-2)' }}>
                    JPG, PNG up to 5MB
                  </p>
                </div>
              </div>
            </div>

            {/* Name */}
            <div className="form-group">
              <label className="form-label">Product Name</label>
              <input
                type="text"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Handmade Shea Butter Soap"
                required
              />
            </div>

            {/* Description */}
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                name="description"
                className="form-textarea"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                placeholder="Describe your product..."
              />
            </div>

            {/* Price + Stock */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Price ($)</label>
                <input
                  type="number"
                  name="price"
                  className="form-input"
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Stock</label>
                <input
                  type="number"
                  name="stock"
                  className="form-input"
                  min="0"
                  value={formData.stock}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Status */}
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                name="status"
                className="form-select"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
              <p className="form-hint">Only active products can be featured in live sessions</p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isLoading}
              style={{ width: '100%' }}
            >
              {isLoading ? (
                <span className="spinner" />
              ) : (
                <>
                  <Save size={18} />
                  {isEditing ? 'Update Product' : 'Create Product'}
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
