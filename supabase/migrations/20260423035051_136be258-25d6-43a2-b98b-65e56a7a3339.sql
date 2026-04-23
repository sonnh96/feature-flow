-- Create public bucket for feature description images
INSERT INTO storage.buckets (id, name, public)
VALUES ('feature-images', 'feature-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Feature images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'feature-images');

-- Authenticated users can upload to their own folder
CREATE POLICY "Users can upload their own feature images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'feature-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own feature images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'feature-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own feature images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'feature-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);