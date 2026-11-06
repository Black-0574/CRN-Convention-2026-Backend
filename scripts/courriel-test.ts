/**
 * Vérifie l'envoi des e-mails de la boutique : connexion et authentification SMTP, puis un e-mail
 * d'essai au gabarit de la boutique vers l'adresse donnée. N'affiche jamais le mot de passe.
 *
 *   npm run courriel:test -- destinataire@exemple.com
 */
import { gabarit, MessagerieSmtp, messagerieDepuisEnv } from '../src/boutique/lib/messagerie';

const destinataire = process.argv.slice(2).find((a) => a.includes('@'));
if (!destinataire) {
  console.error('Usage : npm run courriel:test -- destinataire@exemple.com');
  process.exit(1);
}

const m = messagerieDepuisEnv();
if (!(m instanceof MessagerieSmtp)) {
  console.error('✗ SMTP non configuré : SMTP_HOST, SMTP_USER et SMTP_PASS sont requis (voir .env.example).');
  process.exit(1);
}

try {
  await m.verifier();
  console.log(`✓ Connexion SMTP acceptée (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 465}, ${process.env.SMTP_USER})`);
  await m.envoyer({
    a: destinataire,
    reference: 'ESSAI',
    sujet: 'Essai d’envoi — Boutique de la Convention CRN 2026',
    html: gabarit('Essai d’envoi', '<p>Bonjour,</p><p>Cet e-mail confirme que la boutique de la Convention CRN 2026 peut envoyer les confirmations de commande et les billets.</p>'),
  });
  console.log(`✓ E-mail d’essai envoyé à ${destinataire}`);
  process.exit(0);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
}
