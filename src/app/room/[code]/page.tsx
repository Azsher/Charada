import GameRoom from '@/components/game-room';

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
    const { code } = await params;
    return <GameRoom code={code} />;
}
