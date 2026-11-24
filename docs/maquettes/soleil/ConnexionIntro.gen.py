import json, sys
P = 14.0
NB = ' '
EASE = 'cubic-bezier(.22,.8,.3,1)'
SOFT = 'cubic-bezier(.45,0,.25,1)'
POP = 'cubic-bezier(.3,1.35,.5,1)'
M = json.load(open('ConnexionIntro.mesures.json')) if len(sys.argv) > 1 else {'bx': 74, 'by': 101, 'tx': 232, 'ty': 101}
SX, SY = 195 - M['bx'], 422 - M['by']
DX, DY = 195 - M['tx'], 422 - M['ty']

kfs = []
n = [0]
def anim(frames):
    """frames : liste de (temps en s, css). Renvoie le style d'animation (boucle de P secondes)."""
    n[0] += 1
    name = 'qz%d' % n[0]
    fr = sorted(frames, key=lambda f: f[0])
    if fr[0][0] > 0: fr.insert(0, (0, fr[0][1]))
    if fr[-1][0] < P: fr.append((P, fr[-1][1]))
    body = ''.join('%.3f%%{%s}' % (t / P * 100, css) for t, css in fr)
    kfs.append('@keyframes %s{%s}' % (name, body))
    return 'animation: %s %ss linear infinite' % (name, P)

def appear(t, d=0.07, extra_from='', extra_to=''):
    return anim([(t, 'opacity:0;' + extra_from + 'animation-timing-function:' + EASE), (t + d, 'opacity:1;' + extra_to)])

def typed(text, t0, step):
    """Texte écrit lettre par lettre : mots insécables, chaque lettre apparaît à son tour. Renvoie (html, temps de fin)."""
    words = text.split(' ')
    out, t = [], t0
    for w in words:
        letters = []
        for ch in w:
            letters.append('<span style="%s">%s</span>' % (appear(t, 0.06), ch))
            t += step
        out.append('<span style="white-space: nowrap">%s</span>' % ''.join(letters))
        t += step  # l'espace
    return ' '.join(out), t

T = {}
# --- chronologie (secondes) ---
T['sun_in'], T['sun_full'] = 0.35, 1.05
T['name_in'], T['name_full'] = 1.0, 1.5
T['move'], T['moved'] = 1.85, 2.45
T['card'] = 2.45
T['label'] = 2.85
T['q'] = 3.0

sun = anim([(0, 'opacity:0;transform:translate(%dpx,%dpx) scale(.2)' % (SX, SY)),
            (T['sun_in'], 'opacity:0;transform:translate(%dpx,%dpx) scale(.2);animation-timing-function:%s' % (SX, SY, EASE)),
            (T['sun_full'], 'opacity:1;transform:translate(%dpx,%dpx) scale(2.7)' % (SX, SY)),
            (T['move'], 'opacity:1;transform:translate(%dpx,%dpx) scale(2.7);animation-timing-function:%s' % (SX, SY, SOFT)),
            (T['moved'], 'opacity:1;transform:translate(0,0) scale(1)'),
            (T['moved'] + 0.1, 'opacity:1;transform:translate(0,0) scale(1)'),
            (T['moved'] + 0.25, 'opacity:0;transform:translate(0,0) scale(1)')])
def halo(scale, op, t_in):
    return anim([(0, 'opacity:0;transform:translate(%dpx,%dpx) scale(1)' % (SX, SY)),
                 (t_in, 'opacity:0;transform:translate(%dpx,%dpx) scale(1);animation-timing-function:%s' % (SX, SY, EASE)),
                 (t_in + 0.7, 'opacity:%s;transform:translate(%dpx,%dpx) scale(%s)' % (op, SX, SY, scale)),
                 (T['move'], 'opacity:%s;transform:translate(%dpx,%dpx) scale(%s);animation-timing-function:%s' % (op, SX, SY, scale, SOFT)),
                 (T['moved'] - 0.1, 'opacity:0;transform:translate(0,0) scale(1)')])
halo1, halo2 = halo(3.7, 0.32, 0.5), halo(4.8, 0.18, 0.65)
badge = anim([(0, 'opacity:0'), (T['moved'], 'opacity:0'), (T['moved'] + 0.12, 'opacity:1')])
titre = anim([(0, 'opacity:0;transform:translate(%dpx,%dpx) scale(1.25)' % (DX, DY)),
              (T['name_in'], 'opacity:0;transform:translate(%dpx,%dpx) scale(1.25);animation-timing-function:%s' % (DX, DY, EASE)),
              (T['name_full'], 'opacity:1;transform:translate(%dpx,%dpx) scale(1.45)' % (DX, DY)),
              (T['move'], 'opacity:1;transform:translate(%dpx,%dpx) scale(1.45);animation-timing-function:%s' % (DX, DY, SOFT)),
              (T['moved'], 'opacity:1;transform:translate(0,0) scale(1)')])
card = anim([(T['card'], 'opacity:0;transform:translateY(46px) rotate(-1.5deg);animation-timing-function:' + EASE),
             (T['card'] + 0.45, 'opacity:1;transform:translateY(0) rotate(-1.5deg)')])
label = appear(T['label'], 0.2)
question, t_q_end = typed('Où Mamie Marie a-t-elle rencontré Papi Jean' + NB + '?', T['q'], 0.026)

# Version A : le formulaire arrive dès que la question est écrite ; la conversation continue pendant ce temps.
T['form'] = t_q_end + 0.15
para = appear(T['form'], 0.4, 'transform:translateY(12px);', 'transform:translateY(0);')
form = appear(T['form'] + 0.05, 0.5, 'transform:translateY(70px);', 'transform:translateY(0);')

rows = []
t = T['form'] + 0.25
people = [('O', '#F7A06A', '#4A1E06', 'Au bal du village', True), ('L', '#B9A3E3', '#2E1A5C', 'À l’usine, à Lyon', True), ('?', '#FFD66B', '#5A3A00', 'Et toi, tu dirais quoi' + NB + '?', False)]
for letter, bg, fg, text, dots in people:
    rond_style = anim([(t, 'opacity:0;transform:scale(.4);animation-timing-function:' + POP), (t + 0.3, 'opacity:1;transform:scale(1)')])
    t_bubble = t + (1.05 if dots else 0.3)
    dots_html = ''
    if dots:
        d1, d2 = t + 0.25, t_bubble
        dstyle = anim([(d1, 'opacity:0;transform:scale(.7);animation-timing-function:' + EASE), (d1 + 0.15, 'opacity:1;transform:scale(1)'), (d2 - 0.06, 'opacity:1;transform:scale(1)'), (d2, 'opacity:0;transform:scale(1)')])
        dots_html = ('<span style="position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 5px; height: 100%%; box-sizing: border-box; padding: 0 14px; border-radius: 16px 16px 16px 4px; background: #FFF4E8; transform-origin: left bottom; %s">' % dstyle
                     + ''.join('<span style="width: 7px; height: 7px; border-radius: 4px; background: #8A6A5A; animation: qz-dot 1s ease-in-out %.2fs infinite"></span>' % (i * 0.16) for i in range(3))
                     + '</span>')
    words, t_end = typed(text, t_bubble + 0.08, 0.03)
    # La bulle s'élargit au fil de l'écriture (découpe qui s'ouvre vers la droite), comme une bulle de messagerie.
    R = 'round 16px 16px 16px 4px'
    bubble_style = anim([(t_bubble, 'opacity:0;clip-path:inset(0 72%% 0 0 %s);animation-timing-function:%s' % (R, EASE)),
                         (t_bubble + 0.1, 'opacity:1;clip-path:inset(0 72%% 0 0 %s);animation-timing-function:linear' % R),
                         (max(t_bubble + 0.2, t_end - 0.12), 'opacity:1;clip-path:inset(0 0 0 0 %s)' % R)])
    # La ligne ne prend sa place dans la carte qu'à son tour : la carte grandit au fil de la conversation.
    row_style = anim([(t - 0.05, 'max-height:0;animation-timing-function:' + EASE), (t + 0.25, 'max-height:44px')])
    if dots:
        bubble_look = 'background: #FFF4E8; color: #3B1F14'
    else:
        bubble_look = 'background: rgba(255,255,255,0.14); color: #FFE3CF; border: 2px dashed rgba(255,227,207,0.6)'
    rows.append('''        <span style="display: flex; align-items: center; gap: 10px; %s">
          <span style="display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 34px; height: 34px; box-sizing: border-box; border: 2px solid #FFFFFF; border-radius: 17px; background: %s; color: %s; font-family: Fredoka, sans-serif; font-weight: 600; font-size: 16px; %s">%s</span>
          <span style="position: relative; display: flex">
            <span style="padding: 7px 14px; border-radius: 16px 16px 16px 4px; font-size: 15px; font-weight: 800; transform-origin: left bottom; %s; %s">%s</span>
            %s
          </span>
        </span>''' % (row_style, bg, fg, rond_style, letter, bubble_look, bubble_style, words, dots_html))
    t = t_end + 0.25
T['fin'] = t
voile = anim([(0, 'opacity:0'), (P - 0.6, 'opacity:0;animation-timing-function:' + EASE), (P - 0.1, 'opacity:1')])

html = '''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Connexion – intro animée (version A)</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&display=swap">
<style>
body{margin:0}
@keyframes qz-dot{0%%,60%%,100%%{opacity:.35;transform:translateY(0)}30%%{opacity:1;transform:translateY(-4px)}}
%s
</style>
</helmet>
<!-- Intro animée de la connexion (piste B retenue), version A : le formulaire arrive dès que la question est écrite (~%.1f s), la petite conversation continue pendant qu'on tape son e-mail (fin ~%.1f s).
     Sur le canvas, la séquence tourne en boucle toutes les %d s (fondu au noir… au dégradé, puis on recommence). Dans l'appli : jouée à chaque arrivée sur l'écran de connexion, une seule fois, double toucher = passer directement à l'état final (ConnexionB).
     Chronologie détaillée : docs/ecrans.md, écran 1. -->
<div style="position: relative; width: 390px; height: 844px; box-sizing: border-box; background: linear-gradient(180deg, #FFC98A 0%%, #FFA36B 46%%, #F48A86 100%%); font-family: Nunito, system-ui, sans-serif; color: #3B1F14; display: flex; flex-direction: column; gap: 22px; padding: 70px 20px 30px; overflow: hidden">

  <span aria-hidden="true" style="position: absolute; left: %dpx; top: %dpx; width: 62px; height: 62px; border-radius: 50%%; background: #FFD66B; %s"></span>
  <span aria-hidden="true" style="position: absolute; left: %dpx; top: %dpx; width: 62px; height: 62px; border-radius: 50%%; background: #FFD66B; %s"></span>
  <span aria-hidden="true" style="position: absolute; left: %dpx; top: %dpx; width: 62px; height: 62px; border-radius: 50%%; background: #FFD66B; box-shadow: 0 0 34px rgba(255,233,168,0.9); %s"></span>

  <div style="position: relative; display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 6px">
    <span id="qz-badge" aria-hidden="true" style="display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 62px; height: 62px; border: 4px solid #FFF4E8; border-radius: 50%%; box-sizing: border-box; background: #FFD66B; box-shadow: 0 4px 0 rgba(138,58,18,0.25); font-family: Fredoka, sans-serif; font-weight: 700; font-size: 36px; color: #8A3A12; rotate: -8deg; %s">?</span>
    <span id="qz-titre" style="font-family: Fredoka, Nunito, sans-serif; font-weight: 700; font-size: 52px; line-height: 1; letter-spacing: -0.01em; text-shadow: 0 4px 0 rgba(255,244,232,0.55); %s"><span style="color: #8A3A12">Quiz</span>amily</span>
  </div>

  <div style="position: relative; display: flex; flex-direction: column; gap: 12px; padding: 22px 20px 20px; border-radius: 30px; background: #8A3A12; color: #FFFFFF; overflow: hidden; box-shadow: 0 7px 0 #5E260B; %s">
    <span aria-hidden="true" style="position: absolute; top: -46px; right: -40px; width: 150px; height: 150px; border-radius: 75px; background: #FFD66B; opacity: 0.22"></span>
    <span aria-hidden="true" style="position: absolute; top: -12px; right: -6px; width: 82px; height: 82px; border-radius: 41px; background: #FFD66B; opacity: 0.35"></span>
    <span style="position: relative; font-size: 13px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #FFE3CF; %s">Question de la semaine</span>
    <span style="position: relative; font-family: Fredoka, Nunito, sans-serif; font-weight: 600; font-size: 25px; line-height: 1.12">%s</span>
    <div style="position: relative; display: flex; flex-direction: column; gap: 8px; margin-top: 4px">
%s
    </div>
  </div>
  <p style="margin: 0; padding: 0 6px; font-size: 17px; font-weight: 700; line-height: 1.4; color: #5E2A12; %s">Chaque semaine, une question sur quelqu’un de la famille. Dimanche, on découvre la réponse… et l’histoire qui va avec.</p>

  <section style="margin-top: auto; display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 30px; background: #FFF4E8; box-shadow: 0 7px 0 rgba(138,58,18,0.22); %s">
    <label style="display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 800; color: #6E4A3A">Ton adresse e-mail
      <input type="email" placeholder="prenom@exemple.fr" style="box-sizing: border-box; height: 52px; padding: 0 16px; border: 2px solid #EAD9BD; border-radius: 16px; background: #FFFFFF; font-family: Nunito, sans-serif; font-size: 17px; font-weight: 700; color: #3B1F14">
    </label>
    <button type="button" style="min-height: 54px; border: none; border-radius: 27px; background: #8A3A12; color: #FFFFFF; font-family: Nunito, sans-serif; font-size: 17px; font-weight: 800; cursor: pointer; box-shadow: 0 5px 0 #5E260B">Entrer dans le jeu</button>
    <p style="margin: 0; text-align: center; font-size: 13px; font-weight: 700; color: #6E4A3A">On t’envoie un lien par e-mail, sans mot de passe.</p>
  </section>

  <span aria-hidden="true" style="position: absolute; inset: 0; z-index: 20; pointer-events: none; background: linear-gradient(180deg, #FFC98A 0%%, #FFA36B 46%%, #F48A86 100%%); %s"></span>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
''' % ('\n'.join(kfs), T['form'], T['fin'], P,
       M['bx'] - 31, M['by'] - 31, halo2, M['bx'] - 31, M['by'] - 31, halo1, M['bx'] - 31, M['by'] - 31, sun,
       badge, titre, card, label, question, '\n'.join(rows), para, form, voile)
open(sys.argv[2] if len(sys.argv) > 2 else 'ConnexionIntro.dc.html', 'w', encoding='utf8').write(html)
print(json.dumps({k: round(v, 2) for k, v in T.items()}), len(html))
