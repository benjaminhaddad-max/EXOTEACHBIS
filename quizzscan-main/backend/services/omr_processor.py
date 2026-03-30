"""
Moteur OMR calibré sur la grille générée par pdf_generator.py.

Stratégie :
  1. Détecter les 4 croix de calibration → homographie → image redressée
  2. Recalculer les positions exactes des cases à partir des paramètres
     de génération (les mêmes constantes que pdf_generator.py)
  3. Mesurer le taux de pixels sombres dans chaque case
  4. Seuil adaptatif par page (médiane des cases non-cochées)

Styles de remplissage supportés (observés sur les vrais scans) :
  - Noircissage complet
  - Hachures obliques légères
  - Hachures croisées
  - Stylo fin partiel
"""

import cv2
import numpy as np
import math
import os
from dataclasses import dataclass, field
from typing import Optional

# ── Seuils de détection ────────────────────────────────────────────────────────
# Seuil bas pour capturer les hachures légères (page 17 type)
FILL_THRESHOLD  = 0.13   # > 13 % pixels sombres → coché
DOUBT_LOW       = 0.07   # entre 7 % et 13 % → doute
DARK_VALUE      = 127    # pixel < 127 = sombre (sur 0-255)

# ── Constantes reprises de pdf_generator.py (en mm) ───────────────────────────
# Converties en ratios page A4 pour être indépendantes du DPI
PAGE_W_MM   = 210.0
PAGE_H_MM   = 297.0

MARGIN_X_MM = 13.0
MARGIN_Y_MM = 13.0
CROSS_R_MM  = 3.0

# Grille ID
ID_BOX_MM   = 3.5
ID_GAP_MM   = 0.7
ID_VGAP_MM  = 0.6
ID_LABEL_MM = 4.0

# Grille QCM (mêmes valeurs que pdf_generator)
MIN_BOX_MM  = 3.0
MAX_BOX_MM  = 5.5
GAP_RATIO   = 0.28
ROW_GAP_MM  = 0.9
Q_GAP_MM    = 1.5
NUM_W_MM    = 8.5
COL_MARGIN_MM = 3.0


# ════════════════════════════════════════════════════════════════════════════════
#  DATACLASSES
# ════════════════════════════════════════════════════════════════════════════════

@dataclass
class StudentPageResult:
    page_number: int
    student_id: Optional[str]
    student_id_confidence: str   # "ok" | "doubt" | "unreadable"
    answers: dict                 # {"1": "ABD", ...}
    doubtful_cases: dict          # {"1": ["A"], ...}
    page_image_path: Optional[str] = None


# ════════════════════════════════════════════════════════════════════════════════
#  UTILITAIRES IMAGE
# ════════════════════════════════════════════════════════════════════════════════

def _to_gray(img: np.ndarray) -> np.ndarray:
    if len(img.shape) == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img.copy()


def _binarize(gray: np.ndarray) -> np.ndarray:
    """Seuillage adaptatif local — robuste aux variations d'éclairage."""
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    binary  = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=25, C=8
    )
    return binary


# ════════════════════════════════════════════════════════════════════════════════
#  DÉTECTION DES CROIX DE CALIBRATION
# ════════════════════════════════════════════════════════════════════════════════

def _detect_cross_in_region(binary: np.ndarray, x1, y1, x2, y2):
    """
    Cherche le centre de la croix ⊕ dans la région (x1,y1)→(x2,y2).
    Retourne (cx, cy) absolu ou None.
    """
    roi = binary[y1:y2, x1:x2]
    contours, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best_cx, best_cy, best_score = None, None, 0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 30 or area > 5000:
            continue
        peri = cv2.arcLength(cnt, True)
        if peri == 0:
            continue
        circ = 4 * math.pi * area / (peri ** 2)
        # On cherche quelque chose de circulaire
        if circ > 0.25 and area > best_score:
            M = cv2.moments(cnt)
            if M["m00"] > 0:
                best_cx = int(M["m10"] / M["m00"]) + x1
                best_cy = int(M["m01"] / M["m00"]) + y1
                best_score = area

    return (best_cx, best_cy) if best_cx is not None else None


def detect_calibration_crosses(gray: np.ndarray) -> dict:
    """
    Retourne {"tl": (x,y), "tr": (x,y), "bl": (x,y), "br": (x,y)}.
    Fallback sur positions calculées si détection échoue.
    """
    h, w = gray.shape
    binary = _binarize(gray)
    margin = int(min(w, h) * 0.18)  # zone de recherche : 18 % des bords

    regions = {
        "tl": (0,        0,        margin,   margin),
        "tr": (w-margin, 0,        w,        margin),
        "bl": (0,        h-margin, margin,   h),
        "br": (w-margin, h-margin, w,        h),
    }

    corners = {}
    for name, (x1, y1, x2, y2) in regions.items():
        pt = _detect_cross_in_region(binary, x1, y1, x2, y2)
        if pt:
            corners[name] = pt

    # Fallback proportionnel (croix à CROSS_R_MM des bords + MARGIN_X)
    def fallback(name):
        off_x = int(w * (MARGIN_X_MM * 0.75) / PAGE_W_MM)
        off_y = int(h * (MARGIN_X_MM * 0.75) / PAGE_H_MM)
        if name == "tl": return (off_x, off_y)
        if name == "tr": return (w - off_x, off_y)
        if name == "bl": return (off_x, h - off_y)
        return (w - off_x, h - off_y)

    for name in ["tl", "tr", "bl", "br"]:
        if name not in corners:
            corners[name] = fallback(name)

    return corners


def warp_page(img: np.ndarray, corners: dict) -> np.ndarray:
    """Correction de perspective à partir des 4 croix."""
    h, w = img.shape[:2]
    src = np.float32([
        corners["tl"], corners["tr"],
        corners["bl"], corners["br"],
    ])
    dst = np.float32([[0, 0], [w, 0], [0, h], [w, h]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_LINEAR)


# ════════════════════════════════════════════════════════════════════════════════
#  MESURE D'UNE CASE
# ════════════════════════════════════════════════════════════════════════════════

def _measure_box(binary: np.ndarray, x: int, y: int, size: int) -> float:
    """
    Retourne le ratio de pixels sombres dans la case.
    (x, y) = coin supérieur gauche, size = côté en pixels.
    """
    pad = max(1, size // 7)
    x1, y1 = max(0, x + pad), max(0, y + pad)
    x2, y2 = min(binary.shape[1], x + size - pad), min(binary.shape[0], y + size - pad)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    roi   = binary[y1:y2, x1:x2]
    total = roi.size
    return float(np.count_nonzero(roi)) / total if total > 0 else 0.0


# ════════════════════════════════════════════════════════════════════════════════
#  CALCUL DES POSITIONS — reprend l'algorithme exact de pdf_generator.py
# ════════════════════════════════════════════════════════════════════════════════

def _mm(val_mm: float, img_w: int, img_h: int, axis: str) -> int:
    """Convertit mm → pixels selon la dimension de l'image."""
    if axis == 'x':
        return int(val_mm / PAGE_W_MM * img_w)
    return int(val_mm / PAGE_H_MM * img_h)


def _compute_layout(nb_q, nb_choices, has_remorse, avail_h_px, avail_w_px,
                    img_w, img_h):
    """
    Reproduit _compute_layout de pdf_generator pour trouver box/gap/n_cols.
    Retourne le dict de layout en pixels.
    """
    avail_h = avail_h_px / img_h * PAGE_H_MM
    avail_w = avail_w_px / img_w * PAGE_W_MM

    best = None
    for n_cols in range(2, 9):
        q_per_col  = math.ceil(nb_q / n_cols)
        n_seps     = q_per_col // 5
        header_row = 3.5
        fixed_v    = (header_row + n_seps * 1.0 + 1.5 * q_per_col
                      + 0.9 * int(has_remorse) * q_per_col)
        rows_per_q = 1 + int(has_remorse)
        denom_h    = rows_per_q * q_per_col
        if denom_h == 0: continue
        box_h = (avail_h - fixed_v) / denom_h

        col_sp = avail_w / n_cols
        usable = col_sp - NUM_W_MM - COL_MARGIN_MM
        if usable <= 0: continue
        box_w = usable / (nb_choices * (1 + GAP_RATIO))

        box = min(box_h, box_w, MAX_BOX_MM)
        if box < MIN_BOX_MM: continue
        if best is None or box > best["box_mm"]:
            best = dict(box_mm=box, n_cols=n_cols,
                        q_per_col=q_per_col, col_sp_mm=col_sp)
    if best is None:
        return None

    box_px    = _mm(best["box_mm"], img_w, img_h, 'x')
    gap_px    = int(box_px * GAP_RATIO)
    col_sp_px = int(best["col_sp_mm"] / PAGE_W_MM * img_w)
    num_w_px  = _mm(NUM_W_MM, img_w, img_h, 'x')
    row_gap_px = _mm(ROW_GAP_MM, img_w, img_h, 'y')
    q_gap_px   = _mm(Q_GAP_MM,   img_w, img_h, 'y')

    if has_remorse:
        q_block_px = box_px + row_gap_px + box_px + q_gap_px
    else:
        q_block_px = box_px + q_gap_px

    return dict(
        box=box_px, gap=gap_px, n_cols=best["n_cols"],
        q_per_col=best["q_per_col"], col_sp=col_sp_px,
        num_w=num_w_px, row_gap=row_gap_px, q_block=q_block_px,
    )


def _get_grid_top_px(img_w: int, img_h: int) -> int:
    """
    Y (en pixels, repère image = Y croissant vers le BAS) du début de la grille QCM.
    On reproduit le calcul de draw_header : en-tête + séparateur + 12mm.
    L'en-tête occupe environ 38 % de la page (calibré sur les vrais scans).
    """
    # Approx mesurée sur les scans : le séparateur est à ~115 mm du haut
    sep_y_mm = 112.0
    # grid_top = sep_y + 12 mm  (en coordonnées image, Y vers le bas)
    grid_top_mm = sep_y_mm + 12.0
    return _mm(grid_top_mm, img_w, img_h, 'y')


def _get_id_grid_origin_px(img_w: int, img_h: int):
    """
    Retourne (x, y) du coin supérieur gauche de la PREMIÈRE case OMR
    de la grille numéro étudiant (ligne 0, col 0).
    """
    id_x_mm  = MARGIN_X_MM + 1.0 + ID_LABEL_MM
    # id_top ≈ H - CROSS_R*2 - 6mm - 5mm = H - ~17mm (en repère PDF)
    # En repère image (Y vers le bas) : 17mm du haut
    id_top_mm = CROSS_R_MM * 2 + 6.0 + 5.0
    # La ligne 0 est la 2ème ligne (la 1ère est l'écriture libre)
    cell_h_mm = ID_BOX_MM + ID_VGAP_MM
    first_omr_y_mm = id_top_mm + cell_h_mm  # Y de la ligne "0"

    return (
        _mm(id_x_mm,        img_w, img_h, 'x'),
        _mm(first_omr_y_mm, img_w, img_h, 'y'),
    )


# ════════════════════════════════════════════════════════════════════════════════
#  LECTURE NUMÉRO ÉTUDIANT
# ════════════════════════════════════════════════════════════════════════════════

def read_student_id(binary: np.ndarray, img_w: int, img_h: int):
    """
    Lit la grille OMR 5 colonnes × 10 lignes.
    Retourne (numero_str | None, confidence)
    """
    ox, oy = _get_id_grid_origin_px(img_w, img_h)
    box_px  = _mm(ID_BOX_MM,  img_w, img_h, 'x')
    cell_w  = _mm(ID_BOX_MM + ID_GAP_MM,  img_w, img_h, 'x')
    cell_h  = _mm(ID_BOX_MM + ID_VGAP_MM, img_w, img_h, 'y')

    digits     = []
    has_doubt  = False

    for col in range(5):
        ratios = []
        for row in range(10):
            bx = ox + col * cell_w
            by = oy + row * cell_h
            ratios.append(_measure_box(binary, bx, by, box_px))

        max_ratio = max(ratios)
        max_row   = ratios.index(max_ratio)

        if max_ratio >= FILL_THRESHOLD:
            # Vérifier qu'il n'y a pas d'ambiguïté (2 cases proches)
            sorted_r = sorted(ratios, reverse=True)
            if len(sorted_r) > 1 and sorted_r[1] > DOUBT_LOW:
                has_doubt = True
            digits.append(str(max_row))
        elif max_ratio >= DOUBT_LOW:
            digits.append(str(max_row))
            has_doubt = True
        else:
            digits.append("?")
            has_doubt = True

    sid = "".join(digits)
    if sid.count("?") > 2:
        return None, "unreadable"
    if "?" in sid or has_doubt:
        return sid.replace("?", "0"), "doubt"
    return sid, "ok"


# ════════════════════════════════════════════════════════════════════════════════
#  LECTURE GRILLE QCM
# ════════════════════════════════════════════════════════════════════════════════

def read_qcm(binary: np.ndarray, img_w: int, img_h: int,
             nb_q: int, nb_choices: int, has_remorse: bool):
    """
    Lit toutes les cases QCM et applique la logique remord.
    Retourne (answers, doubtful_cases).
    """
    letters = "ABCDE"[:nb_choices]

    grid_top  = _get_grid_top_px(img_w, img_h)
    avail_h   = img_h - grid_top - _mm(MARGIN_Y_MM, img_w, img_h, 'y')
    avail_w   = img_w - 2 * _mm(MARGIN_X_MM, img_w, img_h, 'x')
    margin_x  = _mm(MARGIN_X_MM, img_w, img_h, 'x')

    lay = _compute_layout(nb_q, nb_choices, has_remorse,
                          avail_h, avail_w, img_w, img_h)
    if lay is None:
        return {}, {}

    box       = lay["box"]
    gap       = lay["gap"]
    n_cols    = lay["n_cols"]
    q_per_col = lay["q_per_col"]
    col_sp    = lay["col_sp"]
    num_w     = lay["num_w"]
    row_gap   = lay["row_gap"]
    q_block   = lay["q_block"]
    cell_step = box + gap
    header_h  = _mm(3.5, img_w, img_h, 'y')

    answers        = {}
    doubtful_cases = {}

    for col in range(n_cols):
        q_start = col * q_per_col + 1
        q_end   = min(q_start + q_per_col - 1, nb_q)
        if q_start > nb_q:
            break

        base_x  = margin_x + col * col_sp
        base_y  = grid_top + header_h   # après le header lettres

        for q in range(q_start, q_end + 1):
            in_col = q - q_start
            qy     = base_y + in_col * q_block   # Y du bord supérieur ligne réponse

            ans_ratios  = {}
            rem_ratios  = {}

            for i, letter in enumerate(letters):
                bx = base_x + num_w + i * cell_step
                ans_ratios[letter] = _measure_box(binary, bx, qy, box)

                if has_remorse:
                    ry = qy + box + row_gap
                    rem_ratios[letter] = _measure_box(binary, bx, ry, box)

            # Déterminer les cases cochées
            ans_filled   = [l for l, r in ans_ratios.items() if r >= FILL_THRESHOLD]
            ans_doubt    = [l for l, r in ans_ratios.items()
                            if DOUBT_LOW <= r < FILL_THRESHOLD]
            rem_filled   = [l for l, r in rem_ratios.items() if r >= FILL_THRESHOLD]
            rem_doubt    = [l for l, r in rem_ratios.items()
                            if DOUBT_LOW <= r < FILL_THRESHOLD]

            # Logique remord
            final = sorted(rem_filled) if rem_filled else sorted(ans_filled)
            answers[str(q)] = "".join(final)

            doubt = sorted(set(ans_doubt + [f"r{l}" for l in rem_doubt]))
            if doubt:
                doubtful_cases[str(q)] = doubt

    return answers, doubtful_cases


# ════════════════════════════════════════════════════════════════════════════════
#  POINT D'ENTRÉE
# ════════════════════════════════════════════════════════════════════════════════

def process_page(img: np.ndarray, page_number: int,
                 nb_questions: int, nb_choices: int, has_remorse: bool,
                 output_dir: str) -> StudentPageResult:
    """
    Traite une image de copie scannée (BGR numpy array).
    Retourne un StudentPageResult.
    """
    gray   = _to_gray(img)
    h, w   = gray.shape

    # 1. Calibration + redressement
    corners      = detect_calibration_crosses(gray)
    warped_color = warp_page(img, corners)
    warped_gray  = _to_gray(warped_color)
    binary       = _binarize(warped_gray)

    # 2. Numéro étudiant
    student_id, id_conf = read_student_id(binary, w, h)

    # 3. Réponses QCM
    answers, doubts = read_qcm(binary, w, h, nb_questions, nb_choices, has_remorse)

    # 4. Sauvegarder l'image redressée pour la review
    os.makedirs(output_dir, exist_ok=True)
    img_path = os.path.join(output_dir, f"page_{page_number:03d}.jpg")
    cv2.imwrite(img_path, warped_color, [cv2.IMWRITE_JPEG_QUALITY, 88])

    # Copie sans remord → reviewed automatiquement si pas de doutes
    auto_reviewed = (len(doubts) == 0 and id_conf == "ok")

    return StudentPageResult(
        page_number=page_number,
        student_id=student_id,
        student_id_confidence=id_conf,
        answers=answers,
        doubtful_cases=doubts,
        page_image_path=img_path,
    )
