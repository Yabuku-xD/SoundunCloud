import React, { useEffect, useState } from 'react';

interface AppImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  imgClassName?: string;
  fallback?: React.ReactNode;
  priority?: boolean;
}

export const AppImage = React.memo(function AppImage({
  src,
  alt = '',
  width,
  height,
  className,
  containerClassName = '',
  containerStyle,
  imgClassName = '',
  fallback,
  priority = false,
  loading,
  decoding,
  fetchPriority,
  style,
  onLoad,
  onError,
  ...rest
}: AppImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`relative overflow-hidden image-shell ${containerClassName}`}
      style={containerStyle}
    >
      {showImage && !loaded && (
        <div className="absolute inset-0 skeleton-shimmer opacity-80" aria-hidden="true" />
      )}

      {showImage ? (
        <img
          {...rest}
          src={src ?? undefined}
          alt={alt}
          width={width}
          height={height}
          className={`${className ?? ''} ${imgClassName} transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`.trim()}
          style={style}
          loading={loading ?? (priority ? 'eager' : 'lazy')}
          decoding={decoding ?? 'async'}
          fetchPriority={fetchPriority ?? (priority ? 'high' : 'auto')}
          onLoad={(event) => {
            setLoaded(true);
            onLoad?.(event);
          }}
          onError={(event) => {
            setFailed(true);
            onError?.(event);
          }}
        />
      ) : (
        fallback
      )}
    </div>
  );
});
