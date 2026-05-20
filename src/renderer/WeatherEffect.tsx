import React, { useEffect, useRef } from 'react';

export type WeatherType = 'off' | 'rain' | 'snow';
export type WeatherIntensity = 'light' | 'medium' | 'heavy';

interface Props {
  type: WeatherType;
  intensity: WeatherIntensity;
}

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  wind: number;
  opacity: number;
}

interface Snowflake {
  x: number;
  y: number;
  speed: number;
  radius: number;
  windAmp: number;
  windFreq: number;
  phase: number;
  opacity: number;
}

const PARTICLE_COUNTS: Record<WeatherIntensity, number> = {
  light: 80,
  medium: 180,
  heavy: 320,
};

const WeatherEffect: React.FC<Props> = ({ type, intensity }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<(RainDrop | Snowflake)[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (type === 'off') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const count = PARTICLE_COUNTS[intensity];
    const particles = particlesRef.current;

    if (particles.length === 0 || particles.length !== count) {
      particles.length = 0;
      if (type === 'rain') {
        for (let i = 0; i < count; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            speed: 600 + Math.random() * 500,
            length: 4 + Math.random() * 16,
            wind: 80 + Math.random() * 60,
            opacity: 0.3 + Math.random() * 0.5,
          });
        }
      } else {
        for (let i = 0; i < count; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            speed: 40 + Math.random() * 60,
            radius: 1.5 + Math.random() * 4,
            windAmp: 30 + Math.random() * 50,
            windFreq: 1 + Math.random() * 2,
            phase: Math.random() * Math.PI * 2,
            opacity: 0.4 + Math.random() * 0.5,
          });
        }
      }
    }

    let lastT = performance.now();

    const draw = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (type === 'rain') {
        for (const p of particles as RainDrop[]) {
          // Wind angle: slight tilt to the right (~10 degrees)
          const wx = p.wind * dt;
          p.x += wx;
          p.y += p.speed * dt;

          if (p.y > canvas.height + p.length) {
            p.y = -p.length;
            p.x = Math.random() * (canvas.width + 100) - 50;
          }
          if (p.x > canvas.width + 50) p.x = -50;
          if (p.x < -50) p.x = canvas.width + 50;

          const endX = p.x - wx * (p.length / p.speed / dt || 0.01) * 0.3;
          const endY = p.y - p.length;

          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(endX, endY);
          ctx.strokeStyle = `rgba(174, 194, 224, ${p.opacity})`;
          ctx.lineWidth = 0.8 + (p.length / 20);
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      } else {
        const t = now / 1000;
        for (const p of particles as Snowflake[]) {
          const wx = Math.sin(t * p.windFreq + p.phase) * p.windAmp * dt;
          p.x += wx;
          p.y += p.speed * dt;

          if (p.y > canvas.height + p.radius * 2) {
            p.y = -p.radius * 2;
            p.x = Math.random() * (canvas.width + 100) - 50;
          }
          if (p.x > canvas.width + 50) p.x = -50;
          if (p.x < -50) p.x = canvas.width + 50;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
          ctx.fill();

          // Subtle inner glow
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
          grad.addColorStop(0, `rgba(255, 255, 255, ${p.opacity + 0.2})`);
          grad.addColorStop(0.6, `rgba(255, 255, 255, ${p.opacity})`);
          grad.addColorStop(1, `rgba(255, 255, 255, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [type, intensity]);

  if (type === 'off') return null;

  return (
    <canvas
      ref={canvasRef}
      className="weather-canvas"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    />
  );
};

export default WeatherEffect;
