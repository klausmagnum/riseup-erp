import { type NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;

  // Rotas públicas que não precisam de autenticação
  const publicRoutes = ['/login', '/login-alt', '/setup'];

  // API endpoints e arquivos estáticos que não precisam proteger
  const excludedPaths = [
    '/_next',
    '/favicon.ico',
    '/api/setup',
    '/api/auth',
    '/api/dev',
  ];

  // Se for rota pública, deixa passar
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Se for arquivo estático ou endpoint de API/setup/dev, deixa passar
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Para todas as outras rotas, verifica autenticação
  const authToken = request.cookies.get('auth-token');

  // Se não tiver token de autenticação, redireciona para login
  if (!authToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protege todas as rotas
    '/(.*)',
  ],
};
