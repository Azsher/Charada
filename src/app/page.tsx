'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Plus, Users, Sparkles } from 'lucide-react';

export default function LandingPage() {
  const [roomCode, setRoomCode] = useState('');
  const [rounds, setRounds] = useState(3);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const generateCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    if (rounds < 1) {
      toast.error('El número de rondas debe ser al menos 1');
      return;
    }
    setIsCreating(true);
    try {
      const code = generateCode();
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({ code, rounds, status: 'lobby' })
        .select()
        .single();

      if (roomError) throw roomError;

      const { error: teamError } = await supabase
        .from('teams')
        .insert([
          { room_id: room.id, team_number: 1, score: 0 },
          { room_id: room.id, team_number: 2, score: 0 }
        ]);

      if (teamError) throw teamError;

      router.push(`/room/${code}?host=true`);
    } catch (error: any) {
      toast.error('Error al crear la sala: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode) return;
    setIsJoining(true);
    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .select('id')
        .eq('code', roomCode.toUpperCase())
        .single();

      if (error || !room) {
        toast.error('Sala no encontrada');
        return;
      }

      router.push(`/room/${roomCode.toUpperCase()}`);
    } catch (error: any) {
      toast.error('Error al unirse: ' + error.message);
    } finally {
      setIsJoining(false);
    }
  };

  if (showSplash) {
    return (
      <div className="min-h-dvh bg-slate-950 flex flex-col items-center justify-center p-4 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 animate-pulse" />
        <div className="relative z-10 text-center space-y-8 animate-in fade-in zoom-in duration-1000">
          <div className="relative">
            <div className="w-32 h-32 bg-gradient-to-tr from-pink-600 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-pink-500/40 animate-bounce">
              {/* Placeholder for Logo */}
              <img src="/logo.png" alt="Charada Logo" className="w-full h-full object-contain animate-bounce" />
            </div>
            <div className="absolute -inset-4 bg-pink-500/20 blur-2xl rounded-full -z-10 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 animate-in slide-in-from-bottom-4 duration-700">
              CHARADA
            </h1>
            <p className="text-slate-400 font-bold tracking-[0.3em] uppercase text-sm animate-in fade-in duration-1000 delay-300">
              Realtime Experience
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-4">
            <div className="h-1.5 w-1.5 bg-pink-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="h-1.5 w-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />

      <Card className="w-full max-w-md bg-slate-900/50 backdrop-blur-2xl border-white/5 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700">
        <CardHeader className="text-center space-y-2 pb-8">
          <CardTitle className="text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-400 to-violet-500">
            Charada
          </CardTitle>
          <CardDescription className="text-slate-400 font-medium text-lg">
            El juego de mímica definitivo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="join-code" className="text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Unirse a una sala</Label>
              <div className="flex gap-2">
                <Input
                  id="join-code"
                  placeholder="CÓDIGO"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 uppercase h-12 text-lg font-bold tracking-widest focus:ring-pink-500/50"
                />
                <Button
                  onClick={handleJoinRoom}
                  disabled={isJoining}
                  className="bg-pink-600 hover:bg-pink-700 h-12 px-6 font-bold shadow-lg shadow-pink-600/20 transition-all active:scale-95"
                >
                  {isJoining ? <Loader2 className="animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                  Unirse
                </Button>
              </div>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/5" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-3 text-slate-600 font-bold">o crear una</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="rounds" className="text-xs font-bold uppercase tracking-widest text-slate-500 ml-1">Número de rondas</Label>
                <div className="bg-white/5 p-1 rounded-xl border border-white/5 flex gap-1">
                  {[3, 5, 10].map((r) => (
                    <Button
                      key={r}
                      variant="ghost"
                      onClick={() => setRounds(r)}
                      className={`flex-1 h-10 font-bold rounded-lg transition-all ${rounds === r ? 'bg-white/10 text-pink-400 shadow-inner' : 'text-slate-500 hover:text-white'}`}
                    >
                      {r}
                    </Button>
                  ))}
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    placeholder="+"
                    value={!([3, 5, 10].includes(rounds)) ? rounds : ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setRounds(isNaN(val) ? 3 : val);
                    }}
                    className="w-16 bg-transparent border-none text-center font-bold focus:ring-0 placeholder:text-slate-600"
                  />
                </div>
              </div>
              <Button
                onClick={handleCreateRoom}
                disabled={isCreating}
                variant="secondary"
                className="w-full bg-white/5 hover:bg-white/10 border-white/10 h-14 text-lg font-black tracking-tight group transition-all active:scale-[0.98]"
              >
                {isCreating ? <Loader2 className="animate-spin" /> : <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" />}
                NUEVA SALA
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-4 pb-8 flex flex-col items-center gap-4">
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
          <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-600">
            Powered by <span className="text-slate-400">Next.js & Supabase</span>
          </p>
        </CardFooter>
      </Card>

      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
