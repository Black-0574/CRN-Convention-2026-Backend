import type { Payload } from 'payload';

import { publierAnnonceUneFois, typo, type AnnonceAPublier } from './annonces';

/**
 * Appel à candidatures pour l'équipe médias, communication et production audiovisuelle
 * (article et visuel du Commanditaire, 13 novembre 2026), publié en tête des Actualités.
 * Visuel avec visages générés : dérogation validée par le Commanditaire (docs/conformite.md).
 * Le bouton de l'article ouvre le formulaire de la page Contact sur « Dépôt de candidature ».
 */
export const APPEL_CANDIDATURES: AnnonceAPublier = {
  slug: 'appel-candidatures-equipe-medias',
  titre: typo('CRN Convention 2026 : appel à candidatures pour rejoindre l’équipe médias, communication et production audiovisuelle'),
  texte: typo('Le CRN lance un casting pour constituer l’équipe bénévole qui assurera la couverture médiatique de la Convention. Candidatures ouvertes aux membres du réseau jusqu’au dimanche 22 novembre 2026.'),
  date: '2026-11-13',
  categorie: 'Appel à candidatures',
  icone: 'people',
  visuel: 'appel-candidatures-medias.webp',
  imageAlt: typo('Appel à candidatures de la Convention CRN 2026, profils recherchés : journalistes et reporters ; JRI (cadreurs, reporters d’images) ; rédacteurs et rédactrices (web, contenus, communiqués) ; chargés de communication et community managers ; photographes et photojournalistes ; monteurs vidéo ; techniciens du son (régie, captation, podcast) ; graphistes et motion designers ; techniciens de streaming et de régie vidéo. www.crn-convention2026.events'),
  article: [
    'Journalistes, reporters, rédacteurs, communicateurs, photographes, cadreurs, techniciens du son et de la vidéo : Christ Révélé aux Nations (CRN) lance un casting pour constituer une équipe de bénévoles qui assurera la couverture médiatique de sa Convention 2026, prévue du 6 au 13 décembre à Libreville, au Gabon. Les membres du réseau CRN intéressés ont jusqu’au dimanche 22 novembre 2026 pour déposer leur candidature.',
    '## Une grande mobilisation des talents au service de la Convention CRN 2026',
    'Du 6 au 13 décembre 2026, Libreville accueillera la grande Convention de Christ Révélé aux Nations (CRN), placée sous le thème : « Du Trône à l’autel, de l’autel à la cité ».',
    'Ce rassemblement réunira les membres, responsables et communautés du réseau CRN autour d’un programme de rencontres, d’enseignements et de célébrations.',
    'Pour accompagner cet événement et en assurer une couverture médiatique à la hauteur de ses ambitions, le CRN entend déployer un dispositif associant journalisme, communication digitale, photographie, production audiovisuelle et diffusion en direct.',
    'C’est dans cette perspective qu’un appel à candidatures est officiellement lancé pour recruter des bénévoles temporaires, issus des églises et communautés du réseau.',
    'L’objectif est de mobiliser des compétences complémentaires afin de documenter les activités, valoriser les moments forts et permettre aux publics, au Gabon comme à l’international, de suivre les différentes séquences de la Convention.',
    '## Cinq grands domaines de compétences recherchés',
    'Le casting s’adresse à des profils variés, professionnels confirmés, jeunes talents ou personnes en cours de formation disposant d’aptitudes pratiques.',
    '### Journalisme et reportage',
    'Le CRN recherche des journalistes, reporters, journalistes reporters d’images (JRI), présentateurs et animateurs TV/WebTV, intervieweurs, chroniqueurs et correspondants de terrain.',
    'Ces profils contribueront notamment à réaliser des interviews, reportages, témoignages et comptes rendus des différentes activités.',
    '### Rédaction et communication digitale',
    'Les rédacteurs web, journalistes web, chargés de communication, community managers et créateurs de contenus digitaux sont également invités à candidater.',
    'Leur mission consistera notamment à produire et diffuser des contenus éditoriaux, des articles d’actualité, des publications et des informations destinées aux plateformes numériques officielles du CRN.',
    'Les photographes et photojournalistes sont aussi recherchés pour contribuer à la couverture visuelle de l’événement.',
    '### Production audiovisuelle',
    'La Convention mobilisera des compétences en captation, réalisation, montage et diffusion vidéo. Les profils recherchés comprennent les cadreurs, opérateurs de caméra, réalisateurs, assistants de réalisation, monteurs vidéo, régisseurs audiovisuels ainsi que les techniciens de streaming et de régie vidéo.',
    'Ils participeront à la captation des événements, à la production des contenus audiovisuels et aux retransmissions en direct.',
    '### Son, radio et podcast',
    'Le dispositif média prévoit également des activités de production sonore, d’émissions, de podcasts et de plateaux de discussion.',
    'À cet effet, les ingénieurs et techniciens du son, opérateurs de prise de son, animateurs radio et podcast, techniciens de régie audio et assistants de production sont encouragés à se porter candidats.',
    '### Création visuelle et multimédia',
    'Enfin, les graphistes, designers, motion designers, créateurs de contenus multimédias et techniciens de postproduction pourront apporter leur expertise à la création et à l’habillage des contenus de la Convention.',
    '## Une expérience collective au cœur de la transformation digitale du CRN',
    'Au-delà de la couverture d’un événement, cette mobilisation participe à la volonté du CRN de renforcer ses capacités de communication et de production de contenus.',
    'Les bénévoles sélectionnés auront l’occasion de contribuer à un dispositif associant plusieurs formats : articles, photographies, interviews, vidéos courtes, émissions, podcasts et retransmissions en direct.',
    'Ils pourront ainsi collaborer au sein d’une équipe pluridisciplinaire, développer leur expérience pratique et mettre leurs talents au service d’une mission commune.',
    'La Convention CRN 2026 constitue ainsi une opportunité de conjuguer engagement, créativité, compétences professionnelles et service.',
    '## Qui peut participer au casting ?',
    'L’appel à candidatures est ouvert aux membres des églises et communautés du réseau CRN possédant des compétences, une expérience ou des aptitudes dans les domaines recherchés.',
    'Les candidats doivent notamment faire preuve de motivation, de sérieux, de discipline, de créativité et d’esprit d’équipe.',
    'Ils doivent également être disponibles pour les activités de préparation et les missions qui leur seront confiées pendant la Convention, et accepter de travailler sous la coordination de l’équipe média.',
    'Les jeunes talents et les personnes en cours de formation sont expressément encouragés à postuler.',
    '## Un engagement exclusivement bénévole et temporaire',
    'Il est important de préciser que les postes proposés correspondent à des missions de bénévolat temporaire.',
    'Cette participation ne constitue ni un recrutement salarié ni une promesse d’emploi ou de rémunération.',
    'Elle offre néanmoins la possibilité de vivre une expérience collective enrichissante, de collaborer avec d’autres passionnés et de contribuer directement au rayonnement de la Convention.',
    '## Comment se déroulera la sélection ?',
    'Le processus de recrutement sera organisé en cinq étapes successives :',
    [
      '- Dépôt des candidatures : présentation du profil, des compétences et des disponibilités.',
      '- Présélection : examen des dossiers selon les besoins du dispositif média.',
      '- Casting et évaluation pratique : entretien, audition ou test technique adapté au poste sollicité.',
      '- Sélection finale : constitution des équipes et affectation des bénévoles aux différentes missions.',
      '- Briefing et préparation : orientation, formation aux procédures et prise en main du dispositif opérationnel.',
    ].join('\n'),
    'Les modalités pratiques des auditions et des tests seront communiquées aux candidats présélectionnés.',
    '## Comment déposer sa candidature ?',
    'Les membres du CRN intéressés sont invités à préparer les informations suivantes :',
    [
      '- Nom et prénom ;',
      '- Église ou communauté CRN de rattachement ;',
      '- Ville et pays de résidence ;',
      '- Numéro de téléphone ou WhatsApp ;',
      '- Domaine de compétence et poste souhaité ;',
      '- Expérience ou réalisations pertinentes ;',
      '- Disponibilité pendant la Convention ;',
      '- Portfolio ou exemples de réalisations, si disponibles.',
    ].join('\n'),
    '### Date limite : dimanche 22 novembre 2026',
    'Les candidatures doivent être déposées au plus tard le dimanche 22 novembre 2026, à travers le formulaire disponible sur le site officiel.',
    '[Accéder au formulaire de candidature](/contact?objet=candidature#contact-form)',
    '## Votre talent peut contribuer à faire rayonner la Convention !',
    'Vous êtes journaliste, communicateur, rédacteur, photographe, cadreur, monteur, technicien du son, graphiste ou passionné de production audiovisuelle ?',
    'Vous souhaitez mettre vos compétences au service d’un projet collectif et participer à la couverture d’un grand rassemblement ?',
    'La Convention CRN 2026 vous ouvre ses portes ! Rejoignez une équipe de bénévoles engagés, participez à la production de contenus et contribuez à faire vivre les temps forts de cet événement auprès des communautés du CRN, au Gabon et au-delà des frontières.',
    '> Un talent. Une équipe. Une mission commune.',
    'Candidatez avant le 22 novembre 2026 !',
    'Site officiel : https://crn-convention2026.events',
    '> CRN — Une vision. Un réseau. Un impact éternel.',
  ]
    .map(typo)
    .join('\n\n'),
};

export const publierAppelCandidatures = (payload: Payload) => publierAnnonceUneFois(payload, APPEL_CANDIDATURES);
