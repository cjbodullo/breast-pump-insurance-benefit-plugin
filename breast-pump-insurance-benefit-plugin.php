<?php
/**
 * Plugin Name: Breast Pump Insurance Benefit
 * Description: BenefitChecker front end for the BabyBrands breast pump insurance guide. Shortcode: [bbib_insurance_guide]. Requires Breast Pump Insurance Guide.
 * Version: 1.0.0
 * Author: Samplits
 * Text Domain: breast-pump-insurance-benefit-plugin
 * Requires Plugins: breast-pump-insurance-plugin
 */

if (!defined('ABSPATH')) {
    exit;
}

define('BBIB_VERSION', '1.0.0');
define('BBIB_PLUGIN_FILE', __FILE__);
define('BBIB_PLUGIN_URL', plugin_dir_url(__FILE__));
define('BBIB_PLUGIN_PATH', plugin_dir_path(__FILE__));

function bbib_register_assets()
{
    wp_register_style(
        'bbib-fonts',
        'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap',
        [],
        null
    );
    wp_register_style(
        'bbib-guide',
        BBIB_PLUGIN_URL . 'assets/css/guide.css',
        ['bbib-fonts'],
        BBIB_VERSION
    );
    wp_register_script(
        'bbib-guide',
        BBIB_PLUGIN_URL . 'assets/js/guide.js',
        [],
        BBIB_VERSION,
        true
    );
}

add_action('wp_enqueue_scripts', 'bbib_register_assets');

/**
 * @param array<string, string> $atts
 */
function bbib_render_shortcode($atts)
{
    $atts = shortcode_atts(
        [
            'return_url' => home_url('/'),
        ],
        $atts,
        'bbib_insurance_guide'
    );

    if (!function_exists('bbgc_public_directory')) {
        return '<div class="bbib-shell"><p>' . esc_html__('This guide is unavailable right now.', 'breast-pump-insurance-benefit-plugin') . '</p></div>';
    }

    $returnUrl = esc_url_raw($atts['return_url']);
    $savedReturn = esc_url_raw((string) get_option('bbgc_return_url', ''));
    if ($savedReturn !== '') {
        $returnUrl = $savedReturn;
    }
    if ($returnUrl === '') {
        $returnUrl = home_url('/');
    }

    $source = function_exists('bbgc_request_source') ? bbgc_request_source() : 'direct';
    $campaign = function_exists('bbgc_request_campaign') ? bbgc_request_campaign() : '';
    $directory = bbgc_public_directory();
    $noticeVersion = defined('BBGC_NOTICE_VERSION') ? BBGC_NOTICE_VERSION : '2026-11-05';

    wp_enqueue_style('bbib-guide');
    wp_enqueue_script('bbib-guide');

    wp_localize_script('bbib-guide', 'BBIB_GUIDE', [
        'logoUrl' => BBIB_PLUGIN_URL . 'assets/images/benefitchecker-logo.png',
        'returnUrl' => $returnUrl,
        'source' => $source,
        'campaign' => $campaign,
        'restUrl' => esc_url_raw(rest_url('bbgc/v1')),
        'noticeVersion' => $noticeVersion,
        'notice' => __('When you finish, BabyBrands Gift Club will store your answers to improve this guide. Your answers are self-reported, not verified by BabyBrands Gift Club.', 'breast-pump-insurance-benefit-plugin'),
        'insurers' => $directory,
        'privacy' => __('This guide asks for the answers you choose to enter, including your email so BabyBrands Gift Club can link them to your registration. Insurance logins, member numbers, prescriptions and medical documents are not collected here. Browsing the guide is not a signup for marketing.', 'breast-pump-insurance-benefit-plugin'),
        'about' => __('BabyBrands Gift Club  helps you navigate your insurer\'s website. It does not verify benefits or submit claims. Section names vary by plan; check eligibility and conditions with your insurer.', 'breast-pump-insurance-benefit-plugin'),
    ]);

    ob_start();
    ?>
    <div class="bbib-shell" id="bbib-guide">
        <div id="bbib-view">
            <p class="bbib-intro"><?php esc_html_e('Loading the guide…', 'breast-pump-insurance-benefit-plugin'); ?></p>
        </div>
        <dialog id="bbib-notice">
            <h2 id="bbib-notice-title"></h2>
            <p id="bbib-notice-body"></p>
            <button type="button" class="bbib-btn bbib-btn-dark" id="bbib-close-notice"><?php esc_html_e('Close', 'breast-pump-insurance-benefit-plugin'); ?></button>
        </dialog>
    </div>
    <?php

    return ob_get_clean();
}

add_shortcode('bbib_insurance_guide', 'bbib_render_shortcode');
