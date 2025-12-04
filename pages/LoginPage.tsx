import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, LogIn, UserPlus, AlertCircle, Loader } from 'lucide-react';

const LoginPage: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
        setEmail('');
        setPassword('');
        alert('Cadastro realizado! Faça login para continuar.');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-blue/10 to-brand-lime/10 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-brand-blue rounded-lg flex items-center justify-center text-white font-black text-3xl mb-4">
              C
            </div>
            <h1 className="text-3xl font-bold text-brand-blue">CASTRO</h1>
            <p className="text-sm text-slate-500 mt-1">Bingo Master Pro</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-blue text-white py-3 rounded-lg font-semibold hover:bg-brand-blue/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Processando...
                </>
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-5 h-5" /> Criar Conta
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" /> Entrar
                </>
              )}
            </button>
          </form>

          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="w-full mt-4 text-slate-600 hover:text-brand-blue font-medium text-sm transition-colors"
          >
            {isSignUp
              ? 'Já tem conta? Faça login'
              : 'Não tem conta? Crie uma agora'}
          </button>
        </div>

        <div className="text-center mt-6 text-slate-500 text-sm">
          <p>Use qualquer email e senha para testar</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
