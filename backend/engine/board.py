"""Board helpers: snake-path layout and prime check."""

def tile_to_coord(tile: int, size: int) -> tuple[int, int]:
    """Convert a 1-indexed tile number to (row, col) on a snake-path grid.

    The path snakes: row 0 left→right, row 1 right→left, row 2 left→right, ...
    Tiles are numbered 1..N along the path (N = size²).
    """
    idx = tile - 1                     # 0-indexed position along path
    row = idx // size                   # which row
    col_in_row = idx % size             # position within the row
    if row % 2 == 1:                    # odd rows go right→left
        col = size - 1 - col_in_row
    else:
        col = col_in_row
    return (row, col)


def is_prime(n: int) -> bool:
    """Return True if n is a prime number (n >= 2)."""
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    i = 3
    while i * i <= n:
        if n % i == 0:
            return False
        i += 2
    return True
