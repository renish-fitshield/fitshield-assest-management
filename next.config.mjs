/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a verification build run alongside `next dev` without sharing .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['mongoose', 'nodemailer'],
};

export default nextConfig;
