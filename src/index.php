<?php
// Start session for CSRF tokens
session_start();

// Security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Database connection
$db_host = getenv('DB_HOST') ?: 'db';
$db_name = getenv('DB_NAME') ?: 'mydb';
$db_user = getenv('DB_USER') ?: 'user';
$db_pass = getenv('DB_PASS') ?: 'password';
$debug_mode = (getenv('APP_DEBUG') === 'true');

try {
    $pdo = new PDO(
        "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4",
        $db_user,
        $db_pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    if ($debug_mode) {
        die("Database connection failed: " . $e->getMessage());
    } else {
        die("Service temporarily unavailable. Please try again later.");
    }
}

// Generate CSRF token if not exists
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Rate limiting: max 5 inquiries per IP per hour
function check_rate_limit($pdo, $client_ip, $max_per_hour = 5) {
    try {
        $hour_ago = date('Y-m-d H:i:s', time() - 3600);
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM inquiries WHERE ip_address = ? AND created_at > ?");
        $stmt->execute([$client_ip, $hour_ago]);
        return $stmt->fetchColumn() < $max_per_hour;
    } catch (PDOException $e) {
        // If ip_address column doesn't exist, allow submission (graceful degradation)
        return true;
    }
}

$submitted = false;
$error = null;
$client_ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Verify CSRF token
    $token = $_POST['csrf_token'] ?? '';
    if (empty($token) || $token !== ($_SESSION['csrf_token'] ?? '')) {
        $error = "Invalid request. Please try again.";
    } else {
        $name = trim($_POST['name'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $message = trim($_POST['message'] ?? '');
        
        // Input length validation
        $max_name = 100;
        $max_email = 255;
        $max_message = 5000;
        
        // Validation
        if (empty($name) || empty($email) || empty($message)) {
            $error = "Please fill in all required fields.";
        } elseif (strlen($name) > $max_name) {
            $error = "Name must be less than $max_name characters.";
        } elseif (strlen($email) > $max_email) {
            $error = "Email is too long.";
        } elseif (strlen($message) > $max_message) {
            $error = "Message must be less than $max_message characters.";
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = "Please enter a valid email address.";
        } elseif (!check_rate_limit($pdo, $client_ip)) {
            $error = "Too many submissions. Please try again later.";
        } else {
            try {
                // Insert into database
                $stmt = $pdo->prepare("
                    INSERT INTO inquiries (name, email, message, status, ip_address, created_at)
                    VALUES (:name, :email, :message, 'new', :ip, NOW())
                ");
                $stmt->execute([
                    ':name' => $name,
                    ':email' => $email,
                    ':message' => $message,
                    ':ip' => $client_ip
                ]);
                $submitted = true;
                // Regenerate token after successful submission
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            } catch (PDOException $e) {
                $error = "Error saving your inquiry. Please try again later.";
                if ($debug_mode) {
                    $error .= " (" . $e->getMessage() . ")";
                }
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order & Inquiry - Your Business</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem 0;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        
        .nav-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .logo {
            font-size: 1.5rem;
            font-weight: bold;
        }
        
        nav a {
            color: white;
            margin-left: 2rem;
            text-decoration: none;
            transition: opacity 0.3s;
        }
        
        nav a:hover {
            opacity: 0.8;
        }
        
        .hero {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 5rem 2rem;
            text-align: center;
        }
        
        .hero h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }
        
        .hero p {
            font-size: 1.2rem;
            margin-bottom: 2rem;
            opacity: 0.9;
        }
        
        .cta-buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 0.8rem 2rem;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
            display: inline-block;
        }
        
        .btn-primary {
            background: white;
            color: #667eea;
            font-weight: bold;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .btn-secondary {
            background: transparent;
            color: white;
            border: 2px solid white;
        }
        
        .btn-secondary:hover {
            background: white;
            color: #667eea;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
        }
        
        .section {
            padding: 4rem 0;
        }
        
        .section h2 {
            text-align: center;
            margin-bottom: 3rem;
            font-size: 2rem;
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
        }
        
        .feature {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: transform 0.3s;
        }
        
        .feature:hover {
            transform: translateY(-5px);
        }
        
        .feature h3 {
            color: #667eea;
            margin-bottom: 1rem;
        }
        
        #inquiry-form {
            background: #f8f9fa;
            padding: 2rem;
            border-radius: 8px;
            max-width: 600px;
            margin: 0 auto;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }
        
        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 0.8rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1rem;
            font-family: inherit;
        }
        
        .form-group textarea {
            resize: vertical;
            min-height: 120px;
        }
        
        .form-group input:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 5px rgba(102, 126, 234, 0.1);
        }
        
        .form-submit {
            width: 100%;
            padding: 1rem;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.3s;
        }
        
        .form-submit:hover {
            background: #764ba2;
        }
        
        .success-message {
            background: #d4edda;
            color: #155724;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 2rem;
            text-align: center;
        }
        
        footer {
            background: #333;
            color: white;
            text-align: center;
            padding: 2rem;
            margin-top: 4rem;
        }
        
        @media (max-width: 768px) {
            .hero h1 {
                font-size: 1.8rem;
            }
            
            .cta-buttons {
                flex-direction: column;
            }
            
            nav a {
                margin-left: 1rem;
                font-size: 0.9rem;
            }
        }
    </style>
</head>
<body>
    <header>
        <div class="nav-container">
            <div class="logo">Your Business</div>
            <nav>
                <a href="#features">Features</a>
                <a href="#inquiry">Inquiry</a>
            </nav>
        </div>
    </header>
    
    <section class="hero">
        <div class="container">
            <h1>Welcome to Lighthal HomePage</h1>
            <p>Fast, reliable service. Quality you can trust.</p>
            <div class="cta-buttons">
                <button class="btn btn-primary" onclick="document.getElementById('inquiry').scrollIntoView({behavior: 'smooth'})">Send Inquiry</button>
                <a href="#features" class="btn btn-secondary">Learn More</a>
            </div>
        </div>
    </section>
    
    <section id="features" class="section container">
        <h2>Why Choose Us?</h2>
        <div class="features">
            <div class="feature">
                <h3>🚀 Fast Service</h3>
                <p>We pride ourselves on quick turnaround times and efficient delivery.</p>
            </div>
            <div class="feature">
                <h3>✨ Quality Guaranteed</h3>
                <p>Our team ensures every order meets the highest standards.</p>
            </div>
            <div class="feature">
                <h3>💬 24/7 Support</h3>
                <p>Have questions? We're here to help you anytime.</p>
            </div>
        </div>
    </section>
    
    <section id="inquiry" class="section container">
        <h2>Send an Inquiry</h2>
        
        <?php if ($error): ?>
            <div style="background: #f8d7da; color: #721c24; padding: 1rem; border-radius: 4px; margin-bottom: 2rem; border: 1px solid #f5c6cb;">
                ✗ <?= htmlspecialchars($error) ?>
            </div>
        <?php endif; ?>
        
        <?php if ($submitted): ?>
            <div class="success-message">
                ✓ Thank you! We received your inquiry and will get back to you soon.
            </div>
        <?php else: ?>
        
        <form id="inquiry-form" method="POST">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['csrf_token'] ?? '') ?>">
            
            <div class="form-group">
                <label for="name">Name *</label>
                <input type="text" id="name" name="name" value="<?= htmlspecialchars($_POST['name'] ?? '') ?>" maxlength="100" required>
                <small style="color: #999;">Max 100 characters</small>
            </div>
            
            <div class="form-group">
                <label for="email">Email *</label>
                <input type="email" id="email" name="email" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>" maxlength="255" required>
            </div>
            
            <div class="form-group">
                <label for="message">Message * <span style="color: #999;">(<span id="char-count">0</span>/5000)</span></label>
                <textarea id="message" name="message" maxlength="5000" required><?= htmlspecialchars($_POST['message'] ?? '') ?></textarea>
            </div>
            
            <button type="submit" class="form-submit">Send Inquiry</button>
        </form>
        
        <?php endif; ?>
    </section>
    
    <footer>
        <p>&copy; <?= date('Y') ?> Your Business. All rights reserved.</p>
    </footer>
    
    <script>
        // Character counter for message textarea (only if form is visible)
        const messageField = document.getElementById('message');
        const charCount = document.getElementById('char-count');
        
        if (messageField && charCount) {
            messageField.addEventListener('input', function() {
                charCount.textContent = this.value.length;
            });
            // Set initial count if form was resubmitted with error
            charCount.textContent = messageField.value.length;
        }
    </script>
</body>
</html>
