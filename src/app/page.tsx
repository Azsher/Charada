'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Plus, Users } from 'lucide-react';

export default function LandingPage() {
  const [roomCode, setRoomCode] = useState('');
  const [rounds, setRounds] = useState(3);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const router = useRouter();

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

      // Create two teams for the room
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

  return (
    <div className="min-h-dvh bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/10 backdrop-blur-xl border-white/20 text-white shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-violet-400">
            Charada Realtime
          </CardTitle>
          <CardDescription className="text-purple-200">
            El juego de mímica definitivo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join-code">Unirse a una sala</Label>
              <div className="flex gap-2">
                <Input
                  id="join-code"
                  placeholder="CÓDIGO"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 uppercase"
                />
                <Button
                  onClick={handleJoinRoom}
                  disabled={isJoining}
                  className="bg-pink-600 hover:bg-pink-700"
                >
                  {isJoining ? <Loader2 className="animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                  Unirse
                </Button>
              </div>
            </div>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-transparent px-2 text-white/40">o</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rounds">Número de rondas</Label>
                <Input
                  id="rounds"
                  type="number"
                  min="1"
                  max="10"
                  value={isNaN(rounds) ? '' : rounds}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setRounds(isNaN(val) ? 0 : val);
                  }}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <Button
                onClick={handleCreateRoom}
                disabled={isCreating}
                variant="secondary"
                className="w-full bg-white/10 hover:bg-white/20 border-white/10"
              >
                {isCreating ? <Loader2 className="animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Crear Nueva Sala
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="text-center text-xs text-white/30 block">
          Hecho con Next.js, Shadcn y Supabase
        </CardFooter>
      </Card>
    </div>
  );
}
