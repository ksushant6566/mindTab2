import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

export default function MobilePlaceholder() {
    const handleTryMindTab = () => {
        toast.info("MindTab is not available on mobile yet, see you on desktop!", {
            position: "top-center",
        });
    };

    return (
        <main className="min-h-screen w-full bg-black overflow-hidden relative">
            <div className="absolute inset-0 overflow-hidden">
                {[...Array(50)].map((_, i) => (
                    <div
                        key={i}
                        className="mobile-placeholder-particle absolute rounded-full bg-primary opacity-40"
                        style={{
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`,
                            width: `${Math.random() * 6 + 2}px`,
                            height: `${Math.random() * 6 + 2}px`,
                            "--particle-x": `${Math.random() * 200 - 100}px`,
                            "--particle-y": `${Math.random() * 200 - 100}px`,
                            animationDuration: `${Math.random() * 20 + 10}s`,
                        } as CSSProperties}
                    />
                ))}
            </div>
            <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-screen p-6 relative z-10">
                <div className="mobile-placeholder-enter text-center">
                    <h1 className="text-4xl sm:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                        MindTab is Coming to Mobile
                    </h1>
                    <p className="text-xl mb-8 text-muted-foreground">
                        Experience MindTab on your desktop now, mobile launch coming soon!
                    </p>
                </div>
                <div className="mobile-placeholder-pop mb-8">
                    <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
                        <CardContent className="p-0">
                            <img
                                src="/mindtab-notes.png"
                                alt="MindTab Desktop Experience"
                                className="rounded-lg shadow-2xl"
                                width={500}
                                height={300}
                            />
                        </CardContent>
                    </Card>
                </div>
                <div className="mobile-placeholder-enter mobile-placeholder-enter-delayed">
                    <Button variant="outline" size="lg" onClick={handleTryMindTab}>
                        Try MindTab on Desktop
                        <span className="ml-2 inline-flex items-center transition-transform hover:translate-x-1">
                            <ArrowRight className="h-4 w-4" />
                        </span>
                    </Button>
                </div>
            </div>
        </main>
    );
}
