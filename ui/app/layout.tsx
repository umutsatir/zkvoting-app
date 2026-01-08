import { ZkappProvider } from "./contexts/ZkappContext";

import "../styles/globals.css";

export const metadata = {
  title: 'zkVoting App',
  description: 'built with o1js',
  icons: {
    icon: '/assets/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ZkappProvider>
          {children}
        </ZkappProvider>
      </body>
    </html>
  );
}
